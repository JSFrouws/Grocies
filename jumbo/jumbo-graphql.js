/**
 * Jumbo GraphQL API Wrapper
 *
 * Gebaseerd op reverse engineering van www.jumbo.com
 */

const https = require('https');

class JumboGraphQL {
    constructor(options = {}) {
        this.baseUrl = 'https://www.jumbo.com';
        this.graphqlEndpoint = '/api/graphql';
        this.verbose = options.verbose || false;
        this.cookies = options.cookies || '';
    }

    /**
     * Generieke GraphQL request functie
     */
    async graphqlRequest(operationName, variables, query) {
        const body = JSON.stringify({
            operationName,
            variables,
            query
        });

        const options = {
            hostname: 'www.jumbo.com',
            port: 443,
            path: this.graphqlEndpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Origin': 'https://www.jumbo.com',
                'Referer': 'https://www.jumbo.com/',
                // Required Apollo/Jumbo headers
                'apollographql-client-name': 'JUMBO_WEB-search',
                'apollographql-client-version': 'master-v29.2.0-web',
                'x-source': 'JUMBO_WEB-search'
            }
        };

        if (this.cookies) {
            options.headers['Cookie'] = this.cookies;
        }

        if (this.verbose) {
            console.log(`\n📡 GraphQL: ${operationName}`);
            console.log('Variables:', JSON.stringify(variables, null, 2));
        }

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);

                        if (this.verbose) {
                            console.log(`✅ Status: ${res.statusCode}`);
                            console.log('Response:', JSON.stringify(jsonData, null, 2).substring(0, 500) + '...');
                        }

                        if (jsonData.errors) {
                            reject(new Error(`GraphQL Errors: ${JSON.stringify(jsonData.errors)}`));
                        } else {
                            resolve(jsonData.data);
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout after 30 seconds'));
            });

            req.write(body);
            req.end();
        });
    }

    /**
     * Zoek producten
     */
    async searchProducts(searchTerms, options = {}) {
        const {
            offSet = 0,
            searchType = 'keyword'
        } = options;

        const friendlyUrl = `?searchType=${searchType}&searchTerms=${encodeURIComponent(searchTerms)}`;

        const variables = {
            input: {
                searchType,
                searchTerms,
                friendlyUrl,
                offSet,
                currentUrl: `/producten/${friendlyUrl}`,
                previousUrl: '',
                bloomreachCookieId: ''
            }
        };

        // Simplified query (gebaseerd op www.jumbo.com maar verkort voor leesbaarheid)
        const query = `query SearchProducts($input: ProductSearchInput!) {
  searchProducts(input: $input) {
    pageHeader {
      headerText
      count
    }
    start
    count
    products {
      id: sku
      brand
      category: rootCategory
      subtitle: packSizeDisplay
      title
      image
      inAssortment
      availability {
        availability
        isAvailable
        label
      }
      link
      prices: price {
        price
        promoPrice
        pricePerUnit {
          price
          unit
        }
      }
      quantityDetails {
        maxAmount
        minAmount
        stepAmount
        defaultAmount
      }
      promotions {
        id
        tags {
          text
        }
      }
    }
  }
}`;

        return this.graphqlRequest('SearchProducts', variables, query);
    }

    /**
     * Zoeksuggesties voor autocomplete
     */
    async searchSuggestions(searchTerms) {
        const variables = {
            input: {
                searchTerms,
                bloomreachCookieId: ''
            }
        };

        const query = `query SearchSuggestions($input: SearchSuggestionsInput!) {
  searchSuggestions(input: $input) {
    suggestionGroups {
      suggestionType
      title
      suggestions {
        suggestion
        link
      }
    }
  }
}`;

        return this.graphqlRequest('SearchSuggestions', variables, query);
    }

    /**
     * Haal user profile op (vereist login)
     */
    async getProfile() {
        const variables = {};
        const query = `query GetProfile {
  getProfile {
    customerId
    type
    name {
      givenName
      familyName
    }
    email
    birthDate
    loyaltyCard {
      number
    }
  }
}`;

        return this.graphqlRequest('GetProfile', variables, query);
    }

    /**
     * Haal actieve winkelmandje op (vereist login)
     */
    async getBasket(customerId) {
        const variables = {};

        const query = `query BasketPageActiveBasket {
  activeBasket {
    ... on ActiveBasketResult {
      basket {
        id
        totalProductCount
        type
        lines {
          sku
          id
          quantity
          details {
            sku
            title
            subtitle
            brand
            image
            price {
              price
              promoPrice
            }
          }
        }
      }
    }
    ... on BasketError {
      errorMessage
      reason
    }
  }
}`;

        return this.graphqlRequest('BasketPageActiveBasket', variables, query);
    }

    /**
     * Voeg product toe aan winkelmandje (vereist login)
     */
    async addToBasket(customerId, sku, quantity = 1) {
        const variables = {
            input: {
                lines: [
                    {
                        sku,
                        quantity
                    }
                ],
                type: 'ECOMMERCE'
            }
        };

        const query = `mutation BasketPageAddBasketItems($input: AddBasketLinesInput!) {
  addBasketLines(input: $input) {
    ... on Basket {
      id
      totalProductCount
      type
      lines {
        sku
        id
        quantity
        details {
          sku
          title
          subtitle
          brand
          image
          price {
            price
            promoPrice
          }
        }
      }
    }
    ... on Error {
      reason
      errorMessage
      friendlyMessage
    }
  }
}`;

        return this.graphqlRequest('BasketPageAddBasketItems', variables, query);
    }

    /**
     * Update hoeveelheid van product in winkelmandje
     * Gebruikt addBasketLines met SKU om quantity te updaten
     */
    async updateBasketLine(sku, quantity) {
        // addBasketLines update de quantity als het product al in basket zit
        const variables = {
            input: {
                lines: [
                    {
                        sku,
                        quantity
                    }
                ],
                type: 'ECOMMERCE'
            }
        };

        const query = `mutation UpdateBasketQuantity($input: AddBasketLinesInput!) {
  addBasketLines(input: $input) {
    ... on Basket {
      id
      totalProductCount
      type
      lines {
        sku
        id
        quantity
        details {
          sku
          title
          subtitle
          brand
          image
          price {
            price
            promoPrice
          }
        }
      }
    }
    ... on Error {
      reason
      errorMessage
      friendlyMessage
    }
  }
}`;

        return this.graphqlRequest('UpdateBasketQuantity', variables, query);
    }

    /**
     * Verwijder product uit winkelmandje
     */
    async removeBasketLine(lineId) {
        const variables = {
            input: {
                ids: [lineId]
            }
        };

        const query = `mutation RemoveBasketLines($input: RemoveBasketLinesInput!) {
  removeBasketLines(input: $input) {
    ... on Basket {
      id
      totalProductCount
      type
      lines {
        sku
        id
        quantity
        details {
          sku
          title
          subtitle
          brand
          image
          price {
            price
            promoPrice
          }
        }
      }
    }
    ... on Error {
      reason
      errorMessage
      friendlyMessage
    }
  }
}`;

        return this.graphqlRequest('RemoveBasketLines', variables, query);
    }
}

module.exports = { JumboGraphQL };

// Test als dit script direct wordt gerund
if (require.main === module) {
    console.log('\n🧪 Testing Jumbo GraphQL Wrapper\n');
    console.log('='.repeat(60));

    const jumbo = new JumboGraphQL({ verbose: true });

    async function test() {
        try {
            // Test 1: Search for products
            console.log('\n📦 Test 1: Searching for "melk"...\n');
            const searchResults = await jumbo.searchProducts('melk', { pageSize: 5 });

            console.log('\n✅ Search Results:');
            console.log(`Found ${searchResults.searchProducts.count} products`);
            console.log('\nFirst 5 products:');

            searchResults.searchProducts.products.slice(0, 5).forEach((product, i) => {
                console.log(`\n${i + 1}. ${product.title}`);
                console.log(`   SKU: ${product.id}`);
                console.log(`   Price: €${(product.prices.price / 100).toFixed(2)}`);
                console.log(`   Available: ${product.availability.isAvailable ? 'Yes' : 'No'}`);
            });

            // Test 2: Suggestions
            console.log('\n\n📝 Test 2: Getting search suggestions for "bro"...\n');
            const suggestions = await jumbo.searchSuggestions('bro');

            if (suggestions.searchSuggestions) {
                console.log('\n✅ Suggestions:');
                suggestions.searchSuggestions.suggestionGroups?.forEach(group => {
                    console.log(`\n${group.title}:`);
                    group.suggestions?.slice(0, 3).forEach(s => {
                        console.log(`  - ${s.suggestion}`);
                    });
                });
            }

            console.log('\n\n🎉 All tests passed!\n');

        } catch (error) {
            console.error('\n❌ Test failed:', error.message);
        }
    }

    test();
}
