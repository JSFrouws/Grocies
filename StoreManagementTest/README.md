# Jumbo Store Management Test Application

A web application for managing Jumbo supermarket shopping using the jumbo-wrapper API.

## Features

- **User Authentication**: Login with your Jumbo account credentials
- **Remember Me**: Automatically save and load credentials
- **Product Search**: Search for products in the Jumbo catalog
- **Add to Basket**: Add items to your shopping basket
- **View Basket**: See your current basket contents and total price
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- A Jumbo account (for basket and order features)

## Installation

1. Navigate to the project directory:
```bash
cd StoreManagementTest
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create a `.env` file:
```bash
cp .env.example .env
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your web browser and navigate to:
```
http://localhost:3000
```

3. Log in with your Jumbo account credentials

4. Start searching for products and adding them to your basket!

## API Endpoints

The application provides the following REST API endpoints:

### Authentication
- `GET /api/auth/status` - Check login status
- `POST /api/auth/login` - Login with username and password
- `POST /api/auth/logout` - Logout and clear credentials

### Products
- `GET /api/products/search?q=<query>&limit=<number>` - Search for products
- `GET /api/products/:id` - Get product details by ID

### Basket
- `GET /api/basket` - Get current basket
- `POST /api/basket/add` - Add item to basket (requires login)

### Health
- `GET /api/health` - Check API health status

## Project Structure

```
StoreManagementTest/
├── server.js           # Express API server
├── package.json        # Project dependencies
├── credentials.json    # Saved user credentials (auto-generated)
├── public/            # Frontend files
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styles
│   └── app.js         # Frontend JavaScript
├── .env               # Environment variables (optional)
└── README.md          # This file
```

## Important Notes

⚠️ **Authentication Issues**: According to the jumbo-wrapper documentation, there are known issues with authentication (see [issue #1](https://github.com/RinseV/jumbo-wrapper/issues/1)). Some features requiring login (like basket management) may not work properly.

🔒 **Security**: This is a test application. In production:
- Use proper password encryption
- Store credentials in a secure database
- Implement proper session management
- Use HTTPS
- Add CSRF protection

## Features Overview

### Login
- Enter your Jumbo email and password
- Check "Remember my credentials" to save them locally
- Credentials are stored in `credentials.json` (local file)

### Search Products
- Search for any product (e.g., "melk", "brood", "kaas")
- Results show product images, prices, and SKU codes
- Adjust quantity before adding to basket

### Basket Management
- Add products to your basket with custom quantities
- View your complete basket with totals
- Basket operations require login

## Troubleshooting

### "Failed to add to basket"
- Make sure you're logged in with valid Jumbo credentials
- Note: Authentication may be broken due to API changes (see jumbo-wrapper issue #1)

### "Search failed"
- Check your internet connection
- Verify the API server is running

### Port already in use
- Change the port in `.env` file or set `PORT` environment variable:
```bash
PORT=3001 npm start
```

## Development

To run in development mode:
```bash
npm run dev
```

## Technologies Used

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API Wrapper**: jumbo-wrapper
- **HTTP Client**: Axios (via jumbo-wrapper)

## License

MIT

## Credits

Built using the [jumbo-wrapper](https://github.com/RinseV/jumbo-wrapper) API wrapper.
