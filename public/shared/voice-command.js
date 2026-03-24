// =====================
// Voice Command System (toggle: click to start, click to stop)
// =====================

(function () {
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let lastTranscript = null;
    let lastResults = null;

    // Wait for header to load, then bind
    const _initInterval = setInterval(() => {
        const voiceBtn = document.getElementById('voice-btn');
        if (!voiceBtn) return;
        clearInterval(_initInterval);
        initVoice(voiceBtn);
    }, 200);

    function initVoice(voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isRecording) {
                stopAndSend();
            } else {
                startRecording();
            }
        });
    }

    async function startRecording() {
        if (isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';

            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (audioChunks.length > 0) {
                    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    sendAudioCommand(blob);
                }
            };

            mediaRecorder.start(100);
            isRecording = true;

            // Visual feedback
            const voiceBtn = document.getElementById('voice-btn');
            if (voiceBtn) voiceBtn.classList.add('recording');
            const overlay = document.getElementById('voice-overlay');
            if (overlay) overlay.classList.add('active');

            // Click anywhere on overlay to stop
            if (overlay) {
                overlay.onclick = (e) => {
                    e.preventDefault();
                    stopAndSend();
                };
            }

        } catch (err) {
            console.error('Microphone access error:', err);
            if (typeof showToast === 'function') {
                showToast('Microfoon niet beschikbaar. Geef toestemming in je browser.', 'error');
            }
        }
    }

    function stopAndSend() {
        if (!isRecording || !mediaRecorder) return;
        isRecording = false;

        mediaRecorder.stop(); // triggers onstop → sendAudioCommand

        const voiceBtn = document.getElementById('voice-btn');
        if (voiceBtn) voiceBtn.classList.remove('recording');
        const overlay = document.getElementById('voice-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.onclick = null;
        }
    }

    let lastAudioBlob = null; // keep for retrying transcription

    async function sendAudioCommand(blob) {
        lastAudioBlob = blob;
        openVoiceResults();
        setVoiceProcessing('Spraak wordt verwerkt...');

        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        try {
            const response = await fetch(API_BASE + '/voice/command', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Verwerking mislukt');
            }

            lastTranscript = data.transcript;
            lastResults = data.results;

            // Transcription succeeded but LLM failed?
            if (data.llmError) {
                renderLlmError(data.transcript, data.llmError);
            } else {
                renderVoiceResults(data);
            }

        } catch (err) {
            console.error('Voice command error:', err);
            renderTranscriptionError(err.message);
        }
    }

    // Retry just the transcription step (resend audio)
    window.retryTranscription = async function () {
        if (!lastAudioBlob) {
            if (typeof showToast === 'function') showToast('Geen audio om opnieuw te proberen', 'error');
            return;
        }
        sendAudioCommand(lastAudioBlob);
    };

    // Retry just the LLM interpretation step
    window.retryInterpretation = async function () {
        if (!lastTranscript) {
            if (typeof showToast === 'function') showToast('Geen transcript beschikbaar', 'error');
            return;
        }
        setVoiceProcessing('Opnieuw interpreteren...');
        try {
            const response = await fetch(API_BASE + '/voice/interpret', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: lastTranscript })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Interpretatie mislukt');
            lastResults = data.results;
            renderVoiceResults(data);
        } catch (err) {
            renderLlmError(lastTranscript, err.message);
        }
    };

    function openVoiceResults() {
        const overlay = document.getElementById('voice-results-overlay');
        const panel = document.getElementById('voice-results-panel');
        if (overlay) overlay.classList.add('active');
        if (panel) panel.classList.add('active');
    }

    window.closeVoiceResults = function () {
        const overlay = document.getElementById('voice-results-overlay');
        const panel = document.getElementById('voice-results-panel');
        if (overlay) overlay.classList.remove('active');
        if (panel) panel.classList.remove('active');
    };

    function setVoiceProcessing(text) {
        const content = document.getElementById('voice-results-content');
        if (content) {
            content.innerHTML = `<div class="voice-processing"><div class="spinner"></div><p>${text}</p></div>`;
        }
    }

    function renderVoiceResults(data) {
        const content = document.getElementById('voice-results-content');
        if (!content) return;

        let html = '';

        // Transcript
        html += `<div class="voice-transcript">"${escapeHtml(data.transcript)}"</div>`;

        // Understanding
        if (data.understanding) {
            html += `<p style="padding:0 16px 8px;font-size:0.85rem;color:var(--color-text-muted);">${escapeHtml(data.understanding)}</p>`;
        }

        // Actions
        if (data.results && data.results.length > 0) {
            html += '<ul class="voice-actions-list">';
            data.results.forEach((r, i) => {
                const statusClass = r.status === 'success' ? 'success'
                    : r.status === 'needs_confirmation' ? 'pending-confirm'
                        : 'error';

                const icon = r.status === 'success' ? '&#10003;'
                    : r.status === 'needs_confirmation' ? '&#9888;'
                        : '&#10007;';

                html += `<li class="voice-action-item ${statusClass}">`;
                html += `<div class="voice-action-header">${icon} ${escapeHtml(r.action?.description || r.message)}</div>`;

                if (r.status === 'success') {
                    html += `<div class="voice-action-detail">${escapeHtml(r.message)}</div>`;
                } else if (r.status === 'error') {
                    html += `<div class="voice-action-detail" style="color:var(--color-error);">${escapeHtml(r.message)}</div>`;
                } else if (r.status === 'needs_confirmation') {
                    html += `<div class="voice-action-detail">Grote hoeveelheid — bevestiging vereist</div>`;
                    html += `<div class="voice-action-confirm">`;
                    html += `<button class="btn btn-primary btn-small" onclick="confirmVoiceAction(${i})">Bevestigen</button>`;
                    html += `<button class="btn btn-secondary btn-small" onclick="skipVoiceAction(${i})">Overslaan</button>`;
                    html += `</div>`;
                }

                html += '</li>';
            });
            html += '</ul>';
        }

        // Retry button
        html += `<div style="padding:16px;display:flex;gap:8px;">`;
        html += `<button class="btn btn-secondary btn-small" onclick="retryVoiceCommand()" style="flex:1;">Niet correct? Opnieuw proberen</button>`;
        html += `<button class="btn btn-primary btn-small" onclick="closeVoiceResults()" style="flex:1;">Sluiten</button>`;
        html += `</div>`;

        content.innerHTML = html;
    }

    // Transcription failed entirely — retry sends audio again
    function renderTranscriptionError(message) {
        const content = document.getElementById('voice-results-content');
        if (!content) return;
        content.innerHTML = `
            <div style="padding:24px 16px;text-align:center;">
                <p style="color:var(--color-error);font-size:1.1rem;margin-bottom:12px;">&#10007; Transcriptie mislukt</p>
                <p style="font-size:0.9rem;color:var(--color-text-muted);margin-bottom:16px;">${escapeHtml(message)}</p>
                <div style="display:flex;gap:8px;justify-content:center;">
                    <button class="btn btn-primary btn-small" onclick="retryTranscription()">Opnieuw proberen</button>
                    <button class="btn btn-secondary btn-small" onclick="closeVoiceResults()">Sluiten</button>
                </div>
            </div>`;
    }

    // Transcription succeeded but LLM interpretation failed — retry only LLM
    function renderLlmError(transcript, message) {
        const content = document.getElementById('voice-results-content');
        if (!content) return;
        content.innerHTML = `
            <div class="voice-transcript">"${escapeHtml(transcript)}"</div>
            <div style="padding:16px;text-align:center;">
                <p style="color:var(--color-error);font-size:1rem;margin-bottom:8px;">&#10007; Interpretatie mislukt</p>
                <p style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:16px;">${escapeHtml(message)}</p>
                <div style="display:flex;gap:8px;justify-content:center;">
                    <button class="btn btn-primary btn-small" onclick="retryInterpretation()">Opnieuw interpreteren</button>
                    <button class="btn btn-secondary btn-small" onclick="closeVoiceResults()">Sluiten</button>
                </div>
            </div>`;
    }

    // Confirm a pending action
    window.confirmVoiceAction = async function (index) {
        if (!lastResults || !lastResults[index]) return;
        const item = lastResults[index];

        const items = document.querySelectorAll('.voice-action-item');
        const el = items[index];
        if (el) {
            el.className = 'voice-action-item';
            el.innerHTML = '<div class="voice-action-header">&#8987; Uitvoeren...</div>';
        }

        try {
            const response = await fetch(API_BASE + '/voice/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: item.action })
            });

            const data = await response.json();

            if (el) {
                el.className = 'voice-action-item ' + (data.success ? 'success' : 'error');
                const icon = data.success ? '&#10003;' : '&#10007;';
                el.innerHTML = `<div class="voice-action-header">${icon} ${escapeHtml(data.message)}</div>`;
            }

            if (data.success && typeof showToast === 'function') {
                showToast(data.message, 'success');
            }
        } catch (err) {
            if (el) {
                el.className = 'voice-action-item error';
                el.innerHTML = `<div class="voice-action-header">&#10007; ${escapeHtml(err.message)}</div>`;
            }
        }
    };

    // Skip a pending action
    window.skipVoiceAction = function (index) {
        const items = document.querySelectorAll('.voice-action-item');
        const el = items[index];
        if (el) {
            el.className = 'voice-action-item';
            el.style.opacity = '0.5';
            el.innerHTML = '<div class="voice-action-header">Overgeslagen</div>';
        }
    };

    // Retry with feedback
    window.retryVoiceCommand = async function () {
        if (!lastTranscript) {
            if (typeof showToast === 'function') showToast('Geen vorig commando om opnieuw te proberen', 'error');
            return;
        }

        setVoiceProcessing('Opnieuw interpreteren...');

        try {
            const response = await fetch(API_BASE + '/voice/retry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: lastTranscript,
                    feedback: 'De gebruiker gaf aan dat het vorige resultaat niet correct was. Probeer opnieuw met een andere interpretatie.'
                })
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Retry mislukt');

            lastResults = data.results;
            renderVoiceResults(data);

        } catch (err) {
            renderVoiceError(err.message);
        }
    };

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
