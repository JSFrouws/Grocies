const Anthropic = require('@anthropic-ai/sdk');

// Country list for recipe generation
const RECIPE_COUNTRIES = [
    'Italy', 'France', 'Spain', 'Greece', 'Turkey',
    'India', 'Thailand', 'Japan', 'China', 'South Korea',
    'Mexico', 'USA', 'Netherlands', 'Belgium', 'Germany',
    'Morocco', 'Lebanon', 'Vietnam', 'Indonesia', 'Brazil',
    'Argentina', 'Peru', 'Ethiopia', 'Nigeria', 'Portugal',
    'Poland', 'Sweden', 'Norway', 'Russia', 'Ukraine',
    'Iran', 'Pakistan', 'Bangladesh', 'Philippines', 'Malaysia',
    'Egypt', 'Kenya', 'Jamaica', 'Cuba', 'Hungary',
    'Czech Republic', 'Austria', 'Switzerland', 'Denmark', 'Finland'
];

class LLMService {
    constructor(apiKey, provider = 'anthropic', language = 'English') {
        this.provider = provider;
        this.language = language;

        if (provider === 'anthropic') {
            if (!apiKey) {
                throw new Error('Anthropic API key is required');
            }
            this.client = new Anthropic({
                apiKey: apiKey
            });
        } else {
            throw new Error(`LLM provider "${provider}" is not supported yet`);
        }
    }

    // Get list of available countries
    static getCountryList() {
        return RECIPE_COUNTRIES;
    }

    // Generate recipe prompt template
    generateRecipePrompt(country, instructions, existingIngredients = []) {
        let extra = '';
        if (instructions) {
            extra = `\n\nUser preferences:\n- ${instructions}`;
        }

        let ingredientHint = '';
        if (existingIngredients.length > 0) {
            ingredientHint = `\n\nExisting ingredient names in the database (try to reuse these exact names when the same ingredient is needed, for consistency):\n${existingIngredients.join(', ')}`;
        }

        return `Generate a recipe for a traditional dish from ${country}.
Write the entire recipe in ${this.language} (recipe name, ingredient names, instructions, tags — everything).

Requirements:
- Authentic to ${country} cuisine
- Use ingredients commonly available in Dutch supermarkets (Jumbo, Albert Heijn)
- Total cooking time: 30-60 minutes (prep + cook combined)
- Serves 4 people
- Include specific measurements for all ingredients${extra}${ingredientHint}

Return ONLY valid JSON with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "name": "Recipe name in ${this.language}",
  "cuisine": "Cuisine type in ${this.language}",
  "country_of_origin": "${country}",
  "prep_time": 15,
  "cook_time": 30,
  "servings": 4,
  "ingredients": [
    {"name": "ingredient name in ${this.language}", "amount": "200", "unit": "g"}
  ],
  "instructions": "Step-by-step cooking instructions in ${this.language} with numbered steps",
  "tags": ["tag1", "tag2", "tag3"]
}

Important:
- ALL text content must be in ${this.language}
- Make sure ingredients are realistic and available in Netherlands
- Use metric measurements (g, ml, kg, l)
- Include 2-4 relevant tags in ${this.language} (e.g., "snel", "gezond", "vegetarisch", "comfort")
- Instructions should be clear and detailed`;
    }

    // Generate recipe using LLM
    async generateRecipe(country, instructions, existingIngredients = []) {
        if (!RECIPE_COUNTRIES.includes(country)) {
            console.warn(`Warning: "${country}" is not in the predefined country list`);
        }

        const prompt = this.generateRecipePrompt(country, instructions, existingIngredients);

        try {
            const startTime = Date.now();

            const response = await this.client.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 2000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const elapsedTime = Date.now() - startTime;
            console.log(`✓ LLM response received in ${elapsedTime}ms`);

            // Extract text content
            const rawContent = response.content[0].text;

            // Try to parse as JSON
            const parsed = this.parseRecipeJSON(rawContent);

            if (parsed.success) {
                return {
                    success: true,
                    recipe: parsed.recipe,
                    raw: rawContent,
                    elapsedTime
                };
            } else {
                return {
                    success: false,
                    error: parsed.error,
                    raw: rawContent,
                    elapsedTime
                };
            }

        } catch (error) {
            console.error('LLM API Error:', error);

            return {
                success: false,
                error: error.message,
                raw: null
            };
        }
    }

    // Parse JSON response from LLM
    parseRecipeJSON(rawContent) {
        try {
            // Remove markdown code blocks if present (```json or plain ```)
            let jsonString = rawContent.trim();

            if (jsonString.startsWith('```')) {
                jsonString = jsonString.replace(/```\w*\s*/i, '').replace(/```\s*$/, '').trim();
            }

            // Parse JSON
            const recipe = JSON.parse(jsonString);

            // Validate required fields
            const requiredFields = ['name', 'ingredients', 'instructions'];
            for (const field of requiredFields) {
                if (!recipe[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Validate ingredients structure
            if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
                throw new Error('Ingredients must be a non-empty array');
            }

            for (const ingredient of recipe.ingredients) {
                if (!ingredient.name || !ingredient.amount || !ingredient.unit) {
                    throw new Error('Each ingredient must have name, amount, and unit');
                }
            }

            // Set defaults for optional fields
            recipe.cuisine = recipe.cuisine || 'Unknown';
            recipe.prep_time = recipe.prep_time || 15;
            recipe.cook_time = recipe.cook_time || 30;
            recipe.servings = recipe.servings || 4;
            recipe.tags = recipe.tags || [];

            return {
                success: true,
                recipe: recipe
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get random country from list
    static getRandomCountry() {
        return RECIPE_COUNTRIES[Math.floor(Math.random() * RECIPE_COUNTRIES.length)];
    }

    // Given an ingredient name and a list of Jumbo search results, ask the LLM to pick the best match.
    // products: [{ sku, title, subtitle, price, brand }]
    // Returns: { best_sku, ranked: [{ sku, rank, reason }] }
    async suggestProductMapping(ingredientName, products) {
        const productList = products.slice(0, 10).map((p, i) => {
            const price = p.price ? `\u20AC${(p.price / 100).toFixed(2)}` : 'onbekend';
            const sub = p.subtitle ? ` (${p.subtitle})` : '';
            return `${i + 1}. SKU:${p.sku} - "${p.title}"${sub}, ${price}`;
        }).join('\n');

        const prompt = `A Dutch recipe needs the ingredient "${ingredientName}".
Here are Jumbo supermarket products returned by a search:

${productList}

Pick the best matching product(s) to buy. Rules:
- Prefer fresh/whole over processed (e.g. fresh garlic over garlic powder, unless the name suggests otherwise)
- Prefer basic/standard versions over specialty variants
- Consider typical Dutch home cooking
- Ignore products that are clearly wrong matches

Return ONLY valid JSON (no markdown, no explanation):
{
  "best_sku": "...",
  "ranked": [
    { "sku": "...", "rank": 1, "reason": "short reason" },
    { "sku": "...", "rank": 2, "reason": "short reason" }
  ]
}

Include up to 5 ranked options. Only include products that are plausible matches.`;

        const response = await this.client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
        });

        let raw = response.content[0].text.trim();
        if (raw.startsWith('```')) raw = raw.replace(/```\w*\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(raw);
    }
}

module.exports = LLMService;
