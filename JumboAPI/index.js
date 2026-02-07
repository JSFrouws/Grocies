/**
 * JumboAPI - Unofficial Jumbo.com GraphQL API Wrapper
 *
 * A Node.js library for automating Jumbo grocery shopping.
 *
 * Features:
 * - Search products
 * - Get search suggestions
 * - Add items to basket
 * - View basket contents
 * - Automated browser login (bypasses Cloudflare/Auth0)
 *
 * Usage:
 *   const { JumboGraphQL, JumboBrowserAuth } = require('./JumboAPI');
 *
 *   // Login first
 *   const auth = new JumboBrowserAuth({ headless: true });
 *   const result = await auth.login('email@example.com', 'password');
 *
 *   // Then use the API with cookies
 *   const jumbo = new JumboGraphQL({ cookies: result.cookies });
 *   const products = await jumbo.searchProducts('melk');
 */

const { JumboGraphQL } = require('./jumbo-graphql');
const { JumboBrowserAuth } = require('./jumbo-auth-browser');

module.exports = {
    JumboGraphQL,
    JumboBrowserAuth
};
