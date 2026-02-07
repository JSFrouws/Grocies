# Grocies - Meal Planning & Shopping Application

## Project Overview

A comprehensive meal planning and grocery shopping application that integrates with Jumbo supermarket. The system allows users to manage recipes, create meal queues, map ingredients to real products, and automatically generate shopping lists that sync with their Jumbo basket.

---

## Architecture Principles

### Core Principles
1. **Separation of Concerns**: Clear boundaries between business logic, API, and presentation
2. **Single Responsibility**: Each module/service has one clear purpose
3. **Modular Design**: Features organized in isolated folders
4. **Centralized Services**: Shared logic (auth, database) in one place
5. **Simple & Intuitive**: User experience is paramount

### Application Structure

```
Grocies/
├── server.js                    # Main Express server (PORT 3000)
├── package.json                 # Dependencies and scripts
├── .env                         # Environment configuration
│
├── lib/                         # Business Logic Layer
│   ├── database.js              # SQLite initialization & schema
│   ├── auth-service.js          # Centralized Jumbo authentication
│   ├── recipe-service.js        # Recipe CRUD operations
│   ├── queue-service.js         # Queue management + weighted random
│   ├── mapping-service.js       # Ingredient-to-product mappings
│   ├── shopping-list-service.js # Ingredient aggregation
│   └── llm-service.js           # LLM recipe generation
│
├── api/                         # HTTP API Layer (Routes)
│   ├── auth.js                  # Authentication endpoints
│   ├── store.js                 # Store browsing & basket
│   ├── recipes.js               # Recipe endpoints
│   ├── queue.js                 # Queue endpoints
│   ├── mappings.js              # Mapping endpoints
│   └── shopping-list.js         # Shopping list endpoints
│
├── public/                      # Frontend Layer (UI)
│   ├── shared/                  # Shared resources
│   │   ├── header.html          # Navigation header
│   │   ├── common.css           # Dark theme styles
│   │   └── utils.js             # Toast, loading, API helpers
│   │
│   ├── store/                   # Store browsing section
│   │   ├── index.html
│   │   ├── store.js
│   │   └── store.css
│   │
│   ├── recipes/                 # Recipe management section
│   │   ├── index.html
│   │   ├── recipes.js
│   │   └── recipes.css
│   │
│   ├── queue/                   # Meal queue section
│   │   ├── index.html
│   │   ├── queue.js
│   │   └── queue.css
│   │
│   ├── mappings/                # Ingredient mapping section
│   │   ├── index.html
│   │   ├── mappings.js
│   │   └── mappings.css
│   │
│   └── shopping-list/           # Shopping list section
│       ├── index.html
│       ├── shopping-list.js
│       └── shopping-list.css
│
├── jumbo/                       # Jumbo API Integration
│   ├── jumbo-graphql.js         # GraphQL client
│   └── jumbo-auth-browser.js    # Browser automation auth
│
├── data/                        # Persistent Storage
│   ├── meal-planner.db          # SQLite database
│   ├── credentials.json         # Saved Jumbo credentials
│   └── uploads/
│       └── recipes/             # Recipe images
│
└── README.md
```

---

## Technology Stack

### Backend
- **Node.js** v18+
- **Express.js** v4.18 - Web server framework
- **better-sqlite3** v11.0 - Synchronous SQLite database
- **Puppeteer** v24.37 - Browser automation for Jumbo auth
- **Multer** v1.4 - File upload handling
- **@anthropic-ai/sdk** v0.14 - Claude AI integration
- **dotenv** v16.0 - Environment configuration

### Frontend
- **Vanilla JavaScript** (ES6+)
- **HTML5** with semantic markup
- **CSS3** with dark theme design
- **Fetch API** for HTTP requests
- **Native drag-and-drop** for queue reordering

### Database
- **SQLite** - Serverless, file-based database
- **5 Tables**: recipes, meal_queue, consumption_history, ingredient_mappings, recurring_items
- **ACID Compliance** - Data integrity guaranteed

---

## Database Schema

### 1. recipes
Stores all recipes (user-created and LLM-generated)

```sql
CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cuisine TEXT,
    country_of_origin TEXT,
    image_path TEXT,
    prep_time INTEGER,                -- minutes
    cook_time INTEGER,                 -- minutes
    servings INTEGER DEFAULT 4,
    ingredients TEXT NOT NULL,         -- JSON: [{name, amount, unit}]
    instructions TEXT NOT NULL,
    frequency_weight REAL DEFAULT 1.0, -- For weighted random (0.5-2.0)
    tags TEXT,                         -- JSON: ["vegetarian", "quick"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. meal_queue
Current queue of recipes to prepare

```sql
CREATE TABLE meal_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    list_index INTEGER NOT NULL,       -- For manual ordering (drag-drop)
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX idx_queue_order ON meal_queue(list_index);
```

### 3. consumption_history
Tracks when recipes were consumed

```sql
CREATE TABLE consumption_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    consumed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    rating INTEGER,                    -- Optional: 1-5 stars
    notes TEXT,                        -- Optional feedback
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX idx_history_recipe ON consumption_history(recipe_id, consumed_date);
CREATE INDEX idx_history_date ON consumption_history(consumed_date);
```

### 4. ingredient_mappings
Maps generic ingredients to Jumbo products

```sql
CREATE TABLE ingredient_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_name TEXT NOT NULL,     -- Normalized (lowercase, trimmed)
    jumbo_product_id TEXT NOT NULL,
    jumbo_sku TEXT NOT NULL,
    product_details TEXT,              -- JSON: {title, price, image, brand}
    preferred BOOLEAN DEFAULT 1,       -- Allow multiple mappings per ingredient
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ingredient_name, jumbo_sku)
);

CREATE INDEX idx_mappings_ingredient ON ingredient_mappings(ingredient_name);
```

### 5. recurring_items
Pantry staples to add periodically (future feature)

```sql
CREATE TABLE recurring_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL UNIQUE,
    category TEXT,
    occurrence_rate TEXT,              -- "weekly", "biweekly", "monthly"
    last_added_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Endpoints

### Authentication (`/api/auth/`)
- `GET /api/auth/status` - Check if user is logged in
- `POST /api/auth/login` - Login with Jumbo credentials
- `POST /api/auth/logout` - Logout and clear credentials

### Store Browsing (`/api/store/`)
- `GET /api/store/search?q=<query>` - Search Jumbo products
- `GET /api/store/products/:id` - Get product details
- `GET /api/store/basket` - Get current basket
- `POST /api/store/basket/add` - Add item to basket
- `PUT /api/store/basket/update` - Update item quantity
- `DELETE /api/store/basket/remove/:sku` - Remove item from basket

### Recipes (`/api/recipes/`)
- `GET /api/recipes` - List all recipes (with filters)
- `GET /api/recipes/:id` - Get single recipe
- `POST /api/recipes` - Create new recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe
- `POST /api/recipes/:id/image` - Upload recipe image
- `POST /api/recipes/generate` - Generate recipe via LLM
- `GET /api/recipes/meta/cuisines` - Get distinct cuisines
- `GET /api/recipes/meta/countries` - Get distinct countries
- `GET /api/recipes/meta/generation-countries` - Get LLM country list

### Queue (`/api/queue/`)
- `GET /api/queue` - Get current queue (ordered)
- `POST /api/queue/add/:recipeId` - Add recipe to queue
- `POST /api/queue/random` - Add random recipe (weighted)
- `PUT /api/queue/reorder` - Reorder queue items
- `POST /api/queue/:id/consume` - Mark as consumed (logs to history)
- `DELETE /api/queue/:id` - Remove from queue
- `GET /api/queue/history` - Get consumption history
- `GET /api/queue/stats` - Get consumption statistics

### Mappings (`/api/mappings/`)
- `GET /api/mappings` - List all mappings
- `GET /api/mappings/ingredient/:name` - Get mappings for ingredient
- `POST /api/mappings` - Create mapping
- `PUT /api/mappings/:id` - Update mapping
- `DELETE /api/mappings/:id` - Delete mapping
- `GET /api/mappings/unmapped` - Get unmapped ingredients in queue

### Shopping List (`/api/shopping-list/`)
- `GET /api/shopping-list/preview` - Preview aggregated list
- `POST /api/shopping-list/generate` - Add all items to Jumbo basket
- `GET /api/shopping-list/export` - Export as text

---

## Features Specification

### 1. Store Browsing (`/store`)

**Purpose**: Browse Jumbo supermarket, search products, manage basket

**UI Elements**:
- Login form (email, password, remember me)
- Search bar for products
- Product grid with cards (image, title, price, SKU)
- Quantity controls (+ / - buttons, direct input)
- "Add to Basket" button
- Basket sidebar (slide-out panel)
- Product count badge on basket icon

**User Flow**:
1. User logs in with Jumbo credentials
2. Search for products (e.g., "pasta")
3. Adjust quantity, click "Add to Basket"
4. View basket sidebar, modify quantities
5. Navigate to Jumbo website to checkout

**Existing**: This functionality is already implemented in StoreManagementTest

---

### 2. Recipe Management (`/recipes`)

**Purpose**: Create, edit, view, and generate recipes

**UI Elements**:
- Recipe grid (cards with image, name, cuisine, time)
- Filter bar (cuisine, country, tags, search)
- "Create Recipe" button → opens form
- Recipe form:
  - Name, cuisine, country (dropdown)
  - Prep time, cook time, servings
  - Image upload (5MB max, jpg/png/webp)
  - Ingredients list (dynamic rows: name, amount, unit)
  - Instructions (textarea)
  - Tags (comma-separated)
  - Frequency weight (slider 0.5-2.0)
  - "Generate Random Recipe" button
- Recipe detail modal (full view with "Add to Queue" button)

**Generate Random Recipe Flow**:
1. User clicks "Generate Random Recipe"
2. Country dropdown appears (50+ countries)
3. User selects country (or random)
4. Shows loading spinner: "Generating recipe from Italy..."
5. LLM generates recipe (30s timeout)
6. **On success**: Form fills with generated data, user can edit
7. **On failure**: Modal shows raw LLM response with "Copy" button
8. User saves recipe

**Recipe Card Actions**:
- Click card → View details
- "Add to Queue" → Adds to meal queue
- "Edit" → Opens form pre-filled
- "Delete" → Confirmation, then removes

---

### 3. Meal Queue (`/queue`)

**Purpose**: Manage ordered list of recipes to prepare

**UI Elements**:
- Queue list (ordered, draggable)
- Each queue item shows:
  - Drag handle (☰)
  - Recipe image (thumbnail)
  - Recipe name
  - Prep + cook time (e.g., "45 min total")
  - Servings (e.g., "4 servings")
  - "Consume" button (✓ green)
  - "Remove" button (✕ red)
- "Add Random Recipe" button (at top)
- "Generate Shopping List" button
- Queue count badge (e.g., "5 recipes in queue")
- Unmapped ingredients warning badge

**Add Random Recipe Algorithm**:
1. Query consumption_history for recipes consumed in last 14 days
2. Query meal_queue for currently queued recipes
3. Exclude both sets from selection
4. Calculate weighted probability:
   - Base weight: `frequency_weight` from recipes table
   - Higher weight = more likely to be selected
   - Random selection using weighted distribution
5. Add selected recipe to queue (highest list_index + 1)
6. Animate appearance at bottom of list

**Consume Recipe Flow**:
1. User clicks "Consume" button
2. Backend:
   - INSERT into consumption_history (recipe_id, consumed_date)
   - DELETE from meal_queue
   - Reorder remaining items (update list_index)
3. Frontend:
   - Fade-out animation
   - Remove from DOM
   - Toast: "Marked as consumed! 🍽️"
   - Update queue count badge

**Drag-and-Drop Reordering**:
1. User drags recipe by handle
2. Visual feedback (opacity, shadow)
3. Drop in new position
4. Frontend updates visual order immediately
5. PUT /api/queue/reorder with new order
6. Backend updates list_index for all affected items

---

### 4. Ingredient Mapping (`/mappings`)

**Purpose**: Link recipe ingredients to Jumbo products

**Why This Matters**:
- Recipes use generic terms ("chicken breast")
- Jumbo has specific products ("Kip Filet 500g")
- Mapping allows automatic shopping list generation
- **Map once, reuse forever**

**UI Elements**:
- Mappings table:
  - Columns: Ingredient | Jumbo Product | Price | Preferred | Actions
  - Search/filter by ingredient name
  - "Create Mapping" button
- Unmapped ingredients alert (if any in queue)
  - "⚠️ 5 ingredients need mapping"
  - Click to open mapping wizard

**Create Mapping Flow**:
1. User clicks "Create Mapping" or "Map Unmapped"
2. Modal opens with:
   - Ingredient name input (autocomplete from recipes)
   - Jumbo product search bar
   - Search results grid (reuses store search UI)
3. User searches for product (e.g., "kip filet")
4. Clicks product to select
5. Preview shows: "chicken breast → Kip Filet 500g (€5.99)"
6. "Preferred" checkbox (if multiple mappings exist)
7. Save mapping
8. Checkmark animation, move to next unmapped ingredient

**Smart Matching**:
- Normalize ingredient names (lowercase, trim, remove plurals)
- When mapping "tomato", suggest existing "tomatoes" mapping
- Fuzzy matching for partial matches
- Show similar ingredients: "Did you mean 'tomatoes'?"

**Multiple Mappings**:
- Allow one ingredient → multiple products
- User can choose different brands
- Mark one as "preferred" (used for shopping list)

---

### 5. Shopping List Generation (`/shopping-list`)

**Purpose**: Aggregate ingredients from queue, add to Jumbo basket

**UI Elements**:
- "Generate Shopping List" button (on queue page)
- Shopping list preview modal:
  - Recipe list (which recipes are included)
  - Ingredients grouped by category:
    - Produce
    - Meat & Fish
    - Dairy & Eggs
    - Pantry
    - Other
  - Each ingredient shows:
    - Aggregated quantity (e.g., "500g tomatoes")
    - Mapped Jumbo product (image, title, price)
    - Checkboxes (user can uncheck items)
  - Unmapped ingredients highlighted in red
  - Total estimated price
  - Action buttons:
    - "Add All to Basket" (primary)
    - "Map Unmapped" (if applicable)
    - "Export as Text" (copy to clipboard)

**Quantity Aggregation Logic**:
```javascript
// Example:
Recipe 1: 200g tomatoes
Recipe 2: 300g tomatoes
→ Result: 500g tomatoes

Recipe 1: 200g flour
Recipe 2: 1 cup flour
→ Result: 200g + 1 cup (separate lines, different units)

// Unit conversion (basic):
1500g → 1.5kg
2000ml → 2L
```

**Add to Basket Flow**:
1. User clicks "Add All to Basket"
2. Progress modal opens:
   - "Adding items to basket..."
   - Progress bar (1/15 items added)
   - Item-by-item updates
3. For each mapped ingredient:
   - Calculate quantity (round up to whole numbers)
   - jumboClient.addToBasket(customerId, sku, quantity)
   - Update progress bar
   - Small delay (200ms) to avoid rate limiting
4. On completion, show summary:
   - "✓ Added 14 items to basket"
   - "✗ Failed: 1 item (out of stock)"
   - List of failed items with error messages
5. "View Basket" button → opens store basket sidebar

**Unmapped Ingredients Handling**:
- Show warning: "Some ingredients need mapping"
- Options:
  1. "Map Now" → Opens mapping wizard for unmapped items
  2. "Skip Unmapped" → Add only mapped items to basket
  3. "Export as Text" → Copy full list to clipboard for manual shopping

**Export as Text**:
```
🛒 Shopping List
==================================================

📋 Recipes:
1. Pasta Carbonara
2. Greek Salad
3. Chicken Stir-Fry

✓ Mapped Ingredients:
--------------------------------------------------
• spaghetti (400g)
  → Barilla Spaghetti 500g
• tomatoes (500g)
  → Roma Tomaten 500g

⚠️ Unmapped Ingredients:
--------------------------------------------------
• olive oil (3 tbsp)
• oregano (1 tsp)
```

---

## Shared Components

### Navigation Header (`/public/shared/header.html`)

**Included in every page**

```html
<header class="main-header">
    <div class="logo">🍽️ Grocies</div>
    <nav>
        <a href="/store/">Store</a>
        <a href="/recipes/">Recipes</a>
        <a href="/queue/" class="badge-container">
            Queue
            <span class="badge" id="queue-count">0</span>
        </a>
        <a href="/mappings/">Mappings</a>
        <a href="/shopping-list/">Shopping List</a>
    </nav>
    <div class="user-actions">
        <button id="basket-btn" class="badge-container">
            🛒 Basket
            <span class="badge" id="basket-count">0</span>
        </button>
        <button id="logout-btn">Logout</button>
    </div>
</header>
```

**Features**:
- Active state for current page
- Badge updates via JavaScript (queue count, basket count)
- Responsive (hamburger menu on mobile)

### Toast Notifications (`/public/shared/utils.js`)

```javascript
showToast(message, type, duration = 3000)
// type: 'success', 'error', 'info'
```

**Styling**:
- Top-right corner
- Neon green for success
- Neon red for error
- Slide-in animation
- Auto-dismiss after duration

### Loading Overlay (`/public/shared/utils.js`)

```javascript
showLoadingOverlay(message)
hideLoadingOverlay()
```

**Styling**:
- Full-page semi-transparent backdrop
- Spinner with message
- "Loading..." or custom message

### API Helper (`/public/shared/utils.js`)

```javascript
async function apiRequest(endpoint, options = {}) {
    // Centralized fetch wrapper
    // Handles auth headers, error responses
    // Shows toast on error
}
```

---

## Design System

### Color Palette
- **Background**: `#0a0a0a` (near black)
- **Surface**: `rgba(255, 255, 255, 0.05)` (slightly lighter)
- **Primary (Neon Green)**: `#18b459`
- **Danger (Neon Red)**: `#ff4444`
- **Text**: `#e0e0e0` (light gray)
- **Text Secondary**: `#888888` (medium gray)
- **Border**: `rgba(255, 255, 255, 0.1)` (subtle)

### Typography
- **Font Family**: Segoe UI, Roboto, Helvetica, Arial, sans-serif
- **Headings**: 1.5rem - 2rem, bold
- **Body**: 1rem, normal
- **Small**: 0.875rem

### Component Styles

**Card** (Recipe, Product, Queue Item):
```css
.card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.3s;
}
.card:hover {
    border-color: #18b459;
    box-shadow: 0 0 20px rgba(24, 180, 89, 0.3);
    transform: translateY(-2px);
}
```

**Button**:
```css
.btn {
    padding: 0.5rem 1rem;
    border: 1px solid #18b459;
    background: transparent;
    color: #18b459;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s;
}
.btn:hover {
    background: #18b459;
    color: #0a0a0a;
    box-shadow: 0 0 15px rgba(24, 180, 89, 0.5);
}
.btn-primary {
    background: #18b459;
    color: #0a0a0a;
}
.btn-danger {
    border-color: #ff4444;
    color: #ff4444;
}
```

**Input**:
```css
input, textarea, select {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
    padding: 0.5rem;
    border-radius: 4px;
    transition: border-color 0.3s;
}
input:focus {
    border-color: #18b459;
    outline: none;
}
```

### Responsive Breakpoints
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

---

## Environment Configuration

### `.env` File

```bash
# Server
PORT=3000
NODE_ENV=development

# Jumbo API (existing)
JUMBO_USERNAME=your-email@example.com
JUMBO_PASSWORD=your-password

# LLM Configuration
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Database
DB_PATH=./data/meal-planner.db

# File Upload
MAX_IMAGE_SIZE=5242880              # 5MB in bytes
UPLOAD_DIR=./data/uploads/recipes

# Recipe Algorithm
RECIPE_AVOID_DAYS=14                # Don't suggest recipes consumed within X days
DEFAULT_FREQUENCY_WEIGHT=1.0        # Default weight for new recipes
```

---

## Implementation Plan

### Phase 1: Project Setup & Database (Day 1)
1. ✅ Create folder structure
2. ✅ Move existing files to new structure
3. ✅ Rename StoreManagementTest → StoreManagement
4. ✅ Update package.json with new dependencies
5. ✅ Create lib/database.js with schema
6. ✅ Create all service files (lib/)
7. ✅ Test database initialization and seed data

### Phase 2: Centralized Services (Day 2)
1. Create lib/auth-service.js (centralized Jumbo auth)
2. Update server.js to initialize all services
3. Create shared authentication middleware
4. Test auth flow end-to-end

### Phase 3: API Routes (Day 3-4)
1. Create api/auth.js
2. Create api/store.js (migrate existing endpoints)
3. Create api/recipes.js
4. Create api/queue.js
5. Create api/mappings.js
6. Create api/shopping-list.js
7. Update server.js to mount all routes
8. Test all endpoints with Postman/curl

### Phase 4: Shared Frontend Components (Day 5)
1. Create public/shared/header.html
2. Create public/shared/common.css (dark theme)
3. Create public/shared/utils.js (toast, loading, API helper)
4. Test shared components in isolation

### Phase 5: Store Section (Day 6)
1. Migrate existing StoreManagement frontend to public/store/
2. Update to use shared header and styles
3. Integrate with centralized auth
4. Test store browsing, search, basket

### Phase 6: Recipes Section (Day 7-8)
1. Create public/recipes/index.html
2. Create public/recipes/recipes.js
3. Create public/recipes/recipes.css
4. Implement recipe list, create, edit, delete
5. Implement image upload
6. Implement LLM recipe generation
7. Test all recipe operations

### Phase 7: Queue Section (Day 9-10)
1. Create public/queue/index.html
2. Create public/queue/queue.js
3. Create public/queue/queue.css
4. Implement queue list display
5. Implement "Add Random Recipe" with weighted selection
6. Implement drag-and-drop reordering
7. Implement "Consume" functionality
8. Test queue operations and history tracking

### Phase 8: Mappings Section (Day 11-12)
1. Create public/mappings/index.html
2. Create public/mappings/mappings.js
3. Create public/mappings/mappings.css
4. Implement mappings table
5. Implement create/edit mapping modal
6. Integrate Jumbo product search
7. Implement unmapped ingredients detection
8. Test mapping creation and retrieval

### Phase 9: Shopping List Section (Day 13-14)
1. Create public/shopping-list/index.html
2. Create public/shopping-list/shopping-list.js
3. Create public/shopping-list/shopping-list.css
4. Implement shopping list preview
5. Implement ingredient aggregation display
6. Implement "Add to Basket" functionality
7. Implement export as text
8. Test end-to-end: queue → shopping list → Jumbo basket

### Phase 10: Polish & Testing (Day 15-16)
1. Mobile responsiveness for all pages
2. Error handling improvements
3. Loading states and animations
4. Toast notifications for all actions
5. Edge case testing
6. Performance optimization
7. User acceptance testing

---

## Critical Files to Create/Modify

### New Files (High Priority)
1. **server.js** - Main Express server with all routes
2. **lib/auth-service.js** - Centralized authentication
3. **public/shared/header.html** - Navigation header
4. **public/shared/common.css** - Shared styles
5. **public/shared/utils.js** - Shared JavaScript utilities
6. **api/queue.js** - Queue API routes
7. **api/shopping-list.js** - Shopping list API routes
8. **public/queue/index.html** - Queue page
9. **public/queue/queue.js** - Queue frontend logic
10. **public/recipes/index.html** - Recipes page

### Files to Migrate
1. **StoreManagementTest/server.js** → **api/store.js** (extract routes)
2. **StoreManagementTest/public/** → **public/store/**
3. **StoreManagementTest/jumbo-\*** → **jumbo/**

### Files Already Created (from previous work)
1. ✅ lib/database.js
2. ✅ lib/recipe-service.js
3. ✅ lib/queue-service.js
4. ✅ lib/mapping-service.js
5. ✅ lib/shopping-list-service.js
6. ✅ lib/llm-service.js
7. ✅ routes/recipes.js (will move to api/)

---

## Testing Checklist

### Functional Testing
- [ ] User can log in with Jumbo credentials
- [ ] User can browse and search products
- [ ] User can add/remove items from basket
- [ ] User can create recipe manually
- [ ] User can generate recipe via LLM
- [ ] User can upload recipe image
- [ ] User can add recipe to queue
- [ ] User can add random recipe to queue (weighted)
- [ ] User can reorder queue via drag-and-drop
- [ ] User can consume recipe (logs to history)
- [ ] User can create ingredient mapping
- [ ] User can search Jumbo products for mapping
- [ ] User can generate shopping list preview
- [ ] User can add shopping list to Jumbo basket
- [ ] User can export shopping list as text
- [ ] Navigation works between all sections
- [ ] Queue count badge updates
- [ ] Basket count badge updates

### Edge Cases
- [ ] Login fails (wrong credentials)
- [ ] Add recipe with no image
- [ ] Add recipe with unmapped ingredients
- [ ] Generate shopping list with no mappings
- [ ] LLM API timeout
- [ ] Invalid LLM JSON response
- [ ] Jumbo API authentication failure
- [ ] Jumbo basket add failure (out of stock)
- [ ] Empty queue behavior
- [ ] Duplicate ingredient aggregation
- [ ] Large image upload (>5MB)
- [ ] Queue has only recently consumed recipes

### UI/UX Testing
- [ ] Mobile responsiveness (all pages)
- [ ] Toast notifications appear/disappear
- [ ] Loading spinners during async operations
- [ ] Error messages are clear
- [ ] Drag-and-drop smooth on touch devices
- [ ] Image previews display correctly
- [ ] Modal overlays and close buttons work
- [ ] Form validation messages
- [ ] Hover effects on cards/buttons

### Performance Testing
- [ ] Database queries < 100ms
- [ ] Image uploads < 5s
- [ ] Shopping list generation < 2s
- [ ] LLM generation < 30s
- [ ] Page load times < 1s
- [ ] Navigation between pages instant

---

## User Flows

### Flow 1: New User Onboarding
1. Visit app → redirected to /store/
2. See login form
3. Enter Jumbo credentials
4. Logged in → see store browsing interface
5. Navigation header shows all sections
6. Click "Recipes" → see recipe library (with seed data)
7. Click "Queue" → see empty queue with "Add Random Recipe" button
8. Click "Add Random Recipe" → recipe appears in queue
9. Click "Generate Shopping List" → see preview modal
10. See unmapped ingredients warning
11. Click "Map Now" → guided through mapping process
12. Return to shopping list → all ingredients mapped
13. Click "Add to Basket" → items added to Jumbo basket
14. Navigate to store section → see basket with items

### Flow 2: Weekly Meal Planning
1. User navigates to /recipes/
2. Clicks "Create Recipe" or "Generate Random Recipe"
3. Generates 2-3 LLM recipes (different countries)
4. Saves recipes with images
5. Navigates to /queue/
6. Adds 2 manual recipes from library
7. Clicks "Add Random Recipe" 3 times
8. Queue now has 5 recipes
9. Drags to reorder (put quick meals first)
10. Clicks "Generate Shopping List"
11. Reviews aggregated ingredients
12. Unchecks items already in pantry
13. Clicks "Add All to Basket"
14. Monitors progress (15 items added)
15. Navigates to Jumbo website to checkout
16. Over next week, clicks "Consume" as meals are eaten
17. Adds new recipes to queue as old ones are consumed

### Flow 3: Ingredient Mapping Management
1. User navigates to /mappings/
2. Sees table of existing mappings
3. Filters by ingredient name ("chicken")
4. Sees multiple chicken mappings (different brands)
5. Clicks "Create Mapping"
6. Types ingredient: "coconut milk"
7. Searches Jumbo: "kokosmelk"
8. Sees results with prices
9. Selects "Albert Heijn Kokosmelk 400ml"
10. Marks as "Preferred"
11. Saves mapping
12. Returns to mappings list → sees new mapping
13. Future recipes with coconut milk auto-map to this product

---

## Security & Best Practices

### Security
- **Credentials Storage**: Local file (acceptable for single-user local app)
- **SQL Injection**: Use parameterized queries (better-sqlite3 binding)
- **File Upload**: Validate file types, sanitize filenames, limit size
- **API Rate Limiting**: Add delays between Jumbo API calls
- **LLM Cost Control**: Cache responses, limit requests

### Best Practices
- **Error Handling**: Try-catch all async operations
- **Logging**: Console.log important events (with timestamps)
- **Database Transactions**: Use transactions for multi-step operations
- **Responsive Design**: Mobile-first approach
- **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation
- **Code Organization**: One responsibility per module
- **Naming Conventions**: Clear, descriptive names

---

## Future Enhancements (Post-MVP)

### Phase 2 Features
- Recipe scaling (adjust servings, auto-scale ingredients)
- Nutritional information (calories, macros)
- Recipe ratings and reviews
- Recipe sharing (export as JSON/PDF)
- Consumption analytics (charts, trends)
- Recurring items automation

### Phase 3 Features
- Multi-user support (family accounts)
- Leftover tracking
- Budget tracking
- Dietary filters (gluten-free, vegan)
- Seasonal recipe recommendations
- Integration with other supermarkets
- Mobile PWA with offline support

---

## Success Criteria

### User Experience
- ✅ User can go from empty queue to shopping basket in < 5 minutes
- ✅ Ingredient mapping success rate > 90%
- ✅ LLM recipe generation success rate > 80%
- ✅ No confusion about how to use any feature
- ✅ User completes full flow without errors

### Technical Performance
- ✅ Database queries: < 100ms average
- ✅ API response times: < 500ms
- ✅ LLM generation: < 30s
- ✅ Page load times: < 1s
- ✅ Zero data loss (SQLite ACID guarantees)

### Code Quality
- ✅ Clear separation of concerns (lib, api, public)
- ✅ Each file has single responsibility
- ✅ No duplicate code
- ✅ Consistent naming conventions
- ✅ Comprehensive error handling

---

**End of Requirements Document**

*Ready to implement! Let's build this! 🚀*
