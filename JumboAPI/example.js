/**
 * JumboAPI Example - Grocery Shopping Automation
 *
 * This example shows how to:
 * 1. Login with browser automation
 * 2. Search for products
 * 3. Add items to basket
 * 4. View basket contents
 */

const { JumboGraphQL, JumboBrowserAuth } = require('./index');

// Configuration
const EMAIL = 'your-email@example.com';
const PASSWORD = 'your-password';

async function main() {
    console.log('\n=== JumboAPI Example ===\n');

    // Step 1: Login (browser-based to bypass Cloudflare)
    console.log('1. Logging in...');
    const auth = new JumboBrowserAuth({
        headless: true,  // Set to false to see the browser
        verbose: true
    });

    const loginResult = await auth.login(EMAIL, PASSWORD);

    if (!loginResult.success) {
        console.error('Login failed:', loginResult.error);
        return;
    }

    console.log('Login successful! Customer ID:', loginResult.customerId);

    // Step 2: Initialize API with cookies
    const jumbo = new JumboGraphQL({
        cookies: loginResult.cookies,
        verbose: true
    });

    // Step 3: Search for products
    console.log('\n2. Searching for products...');
    const searchResults = await jumbo.searchProducts('melk');

    console.log(`Found ${searchResults.searchProducts.count} products`);
    console.log('\nFirst 5 results:');
    searchResults.searchProducts.products.slice(0, 5).forEach((product, i) => {
        console.log(`  ${i + 1}. ${product.title}`);
        console.log(`     SKU: ${product.id}`);
        console.log(`     Price: €${(product.prices.price / 100).toFixed(2)}`);
    });

    // Step 4: Add item to basket
    const firstProduct = searchResults.searchProducts.products[0];
    console.log(`\n3. Adding "${firstProduct.title}" to basket...`);

    const basketResult = await jumbo.addToBasket(
        loginResult.customerId,
        firstProduct.id,
        1  // quantity
    );

    if (basketResult.addBasketLines?.totalProductCount) {
        console.log(`Basket now has ${basketResult.addBasketLines.totalProductCount} items`);
    }

    // Step 5: View basket
    console.log('\n4. Viewing basket contents...');
    const basket = await jumbo.getBasket(loginResult.customerId);

    if (basket.activeBasket?.basket) {
        const lines = basket.activeBasket.basket.lines || [];
        console.log(`\nBasket (${lines.length} items):`);
        lines.forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.details?.title || item.sku} x${item.quantity}`);
        });
    }

    console.log('\n=== Done! ===\n');
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
