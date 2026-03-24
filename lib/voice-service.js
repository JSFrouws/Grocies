const Anthropic = require('@anthropic-ai/sdk');

class VoiceService {
    constructor({ settingsService, recipeService, queueService, stockService, recurringService, mappingService, shoppingListService, authService, llmClient, getJumboClient }) {
        this.settings = settingsService;
        this.recipes = recipeService;
        this.queue = queueService;
        this.stock = stockService;
        this.recurring = recurringService;
        this.mappings = mappingService;
        this.shoppingList = shoppingListService;
        this.auth = authService;
        this.llmClient = llmClient;
        this.getJumboClient = getJumboClient;
    }

    // Transcribe audio using Mistral Voxtral transcription API
    async transcribe(audioBuffer, mimeType = 'audio/webm') {
        const apiKey = this.settings.get('mistral_api_key');
        if (!apiKey) throw new Error('Mistral API key niet ingesteld. Ga naar Instellingen.');

        // Determine file extension from mime type
        const baseMime = mimeType.split(';')[0];
        const extMap = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp3': 'mp3', 'audio/mpeg': 'mp3' };
        const ext = extMap[baseMime] || 'webm';

        // Use native Node FormData + Blob for multipart upload
        const blob = new Blob([audioBuffer], { type: baseMime });
        const form = new FormData();
        form.append('model', 'voxtral-mini-latest');
        form.append('language', 'nl');
        form.append('file', blob, `recording.${ext}`);

        const response = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: form
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Mistral API fout (${response.status}): ${err}`);
        }

        const data = await response.json();
        return data.text || '';
    }

    // Build context for the LLM: all available data and actions
    async buildContext() {
        const recipes = this.recipes.getAllRecipes({});
        const recipeNames = recipes.map(r => `${r.id}: ${r.name}`);

        const queueData = this.queue.getQueue();
        const queueItems = (Array.isArray(queueData) ? queueData : []).map(q => `queue_id=${q.id}: "${q.name}" (bought: ${q.ingredients_bought})`);

        const stockItems = this.stock.getAllStock(false);
        const stockSummary = stockItems.map(s =>
            `${s.ingredient_name}: ${s.quantity_remaining}${s.unit} (vervalt: ${s.expiry_date || 'onbekend'})`
        );

        const recurringItems = this.recurring.getAll(false);
        const recurringList = recurringItems.map(r =>
            `id=${r.id}: "${r.item_name}" (${r.quantity || 1}x, categorie: ${r.category || 'overig'})`
        );

        const availableIngredients = this.stock.getAvailableIngredients();

        return {
            recipeNames,
            queueItems,
            stockSummary,
            recurringList,
            availableIngredients
        };
    }

    // Ask the LLM to interpret the voice command and produce actions
    async interpretCommand(transcript, context, retryWithFeedback = null) {
        const systemPrompt = `Je bent de spraakassistent van Grocies, een Nederlandse maaltijdplanner- en boodschappen-app.
Je ontvangt een getranscribeerde spraakcommando van de gebruiker en je geeft een JSON-response met acties.

BESCHIKBARE ACTIES:
1. "add_to_queue" - Voeg een recept toe aan de wachtrij
   params: { recipe_id: number }
2. "add_random_to_queue" - Voeg een willekeurig recept toe
   params: {}
3. "add_stock" - Voeg voorraad toe (gebruiker heeft iets in huis)
   params: { ingredient_name: string, quantity: number, unit: "g"|"kg"|"mL"|"L"|"stuks" }
4. "update_stock" - Werk voorraad bij
   params: { stock_id: number, quantity_remaining: number }
5. "add_to_basket" - Voeg product toe aan Jumbo mandje (boodschappen)
   params: { query: string, quantity: number }
6. "add_recurring" - Voeg vast boodschappenitem toe
   params: { item_name: string, category: string, quantity: number }
7. "remove_from_queue" - Verwijder recept uit wachtrij
   params: { queue_id: number }
8. "search_product" - Zoek een product bij Jumbo
   params: { query: string }

HUIDIGE CONTEXT:
Recepten: [${context.recipeNames.join(', ')}]
Wachtrij: [${context.queueItems.join(', ')}]
Voorraad: [${context.stockSummary.join(', ')}]
Vaste items: [${context.recurringList.join(', ')}]

REGELS:
- Interpreteer de intentie van de gebruiker en kies de juiste actie(s)
- Als de gebruiker zegt "we eten X" of "deze week X", zoek het recept en gebruik add_to_queue
- Als de gebruiker zegt "X is op" of "voeg X toe", gebruik add_to_basket om boodschappen te doen
- Als de gebruiker zegt "ik heb nog X" of "we hebben X in huis", gebruik add_stock
- Als de gebruiker zegt "we hebben extra X nodig", gebruik add_to_basket
- Schat hoeveelheden in als de gebruiker geen specifieke hoeveelheid noemt (bijv. melk = 1L, pasta = 500g)
- Geef altijd een beschrijving van wat je doet in het Nederlands

Antwoord ALLEEN met geldige JSON (geen markdown):
{
  "understanding": "korte samenvatting van wat je begrepen hebt",
  "actions": [
    {
      "type": "action_type",
      "params": { ... },
      "description": "wat deze actie doet in het Nederlands"
    }
  ]
}`;

        const userMessage = retryWithFeedback
            ? `Vorig antwoord was incorrect. Feedback: ${retryWithFeedback}\n\nOriginele opdracht: "${transcript}"`
            : `Spraakcommando: "${transcript}"`;

        const response = await this.llmClient.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        });

        let raw = response.content[0].text.trim();
        if (raw.startsWith('```')) raw = raw.replace(/```\w*\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(raw);
    }

    // Execute a single action and return result
    async executeAction(action) {
        try {
            switch (action.type) {
                case 'add_to_queue': {
                    const result = this.queue.addToQueue(action.params.recipe_id);
                    return { success: true, message: `Recept toegevoegd aan wachtrij`, data: result };
                }

                case 'add_random_to_queue': {
                    const avoidDays = this.settings.get('avoid_days') || 14;
                    const result = this.queue.addRandomRecipe(avoidDays);
                    return { success: true, message: `Willekeurig recept toegevoegd`, data: result };
                }

                case 'add_stock': {
                    const p = action.params;
                    const result = this.stock.addStock({
                        ingredient_name: p.ingredient_name,
                        quantity_remaining: p.quantity,
                        unit: p.unit,
                        shelf_life_days: p.shelf_life_days || null
                    });
                    return { success: true, message: `${p.ingredient_name} (${p.quantity}${p.unit}) toegevoegd aan voorraad`, data: result };
                }

                case 'update_stock': {
                    const result = this.stock.updateStockQuantity(action.params.stock_id, action.params.quantity_remaining);
                    return { success: true, message: `Voorraad bijgewerkt`, data: result };
                }

                case 'add_to_basket': {
                    if (!this.auth.isAuthenticated()) {
                        return { success: false, message: 'Niet ingelogd bij Jumbo. Log eerst in.' };
                    }
                    const jumbo = this.getJumboClient();
                    const searchResult = await jumbo.searchProducts(action.params.query, { pageSize: 5 });
                    const products = searchResult?.searchProducts?.products || [];
                    if (!products.length) {
                        return { success: false, message: `Geen producten gevonden voor "${action.params.query}"` };
                    }
                    const product = products[0];
                    const sku = product.id;
                    const qty = action.params.quantity || 1;
                    const customerId = this.auth.getCustomerId();
                    const addResult = await jumbo.addToBasket(customerId, sku, qty);
                    const title = product.title || action.params.query;
                    return {
                        success: true,
                        message: `${qty}x "${title}" toegevoegd aan Jumbo mandje`,
                        data: { product: title, sku, quantity: qty, basket: addResult }
                    };
                }

                case 'add_recurring': {
                    const p = action.params;
                    const result = this.recurring.create({
                        item_name: p.item_name,
                        category: p.category || 'overig',
                        quantity: p.quantity || 1
                    });
                    return { success: true, message: `"${p.item_name}" toegevoegd als vast item`, data: result };
                }

                case 'remove_from_queue': {
                    const result = this.queue.removeFromQueue(action.params.queue_id);
                    return { success: true, message: `Verwijderd uit wachtrij`, data: result };
                }

                case 'search_product': {
                    if (!this.auth.isAuthenticated()) {
                        return { success: false, message: 'Niet ingelogd bij Jumbo.' };
                    }
                    const jumboSearch = this.getJumboClient();
                    const searchRes = await jumboSearch.searchProducts(action.params.query, { pageSize: 5 });
                    const items = searchRes?.searchProducts?.products || [];
                    return {
                        success: true,
                        message: `${items.length} producten gevonden voor "${action.params.query}"`,
                        data: items.slice(0, 5).map(p => ({ sku: p.id, title: p.title, price: p.prices?.price }))
                    };
                }

                default:
                    return { success: false, message: `Onbekende actie: ${action.type}` };
            }
        } catch (error) {
            return { success: false, message: `Fout: ${error.message}` };
        }
    }

    // Check if action needs confirmation (>2.1kg or >2.1L of single product)
    needsConfirmation(action) {
        if (action.type === 'add_to_basket') {
            const qty = action.params.quantity || 1;
            // If quantity represents kg or L and exceeds 2.1
            if (qty > 2.1) return true;
        }
        if (action.type === 'add_stock') {
            const p = action.params;
            const qty = p.quantity || 0;
            if ((p.unit === 'kg' && qty > 2.1) || (p.unit === 'L' && qty > 2.1) ||
                (p.unit === 'g' && qty > 2100) || (p.unit === 'mL' && qty > 2100)) {
                return true;
            }
        }
        return false;
    }

    // Interpret + execute (reusable for retry)
    async interpretAndExecute(transcript) {
        const context = await this.buildContext();
        const interpretation = await this.interpretCommand(transcript, context);
        console.log(`🧠 Interpretation:`, JSON.stringify(interpretation));

        // Step 4: Execute actions (split into auto-execute and needs-confirm)
        const results = [];
        for (const action of interpretation.actions) {
            if (this.needsConfirmation(action)) {
                results.push({
                    action,
                    status: 'needs_confirmation',
                    message: action.description
                });
            } else {
                const result = await this.executeAction(action);
                results.push({
                    action,
                    status: result.success ? 'success' : 'error',
                    message: result.message,
                    data: result.data
                });
            }
        }

        return {
            understanding: interpretation.understanding,
            results
        };
    }

    // Full pipeline: transcribe → interpret → execute
    async processVoiceCommand(audioBuffer, mimeType) {
        // Step 1: Transcribe
        const transcript = await this.transcribe(audioBuffer, mimeType);
        console.log(`🎙️ Transcript: "${transcript}"`);

        // Step 2+3: Interpret and execute — if this fails, still return the transcript
        try {
            const result = await this.interpretAndExecute(transcript);
            return { transcript, ...result };
        } catch (error) {
            console.error('LLM interpretation error:', error.message);
            return {
                transcript,
                llmError: error.message,
                understanding: null,
                results: []
            };
        }
    }
}

module.exports = VoiceService;
