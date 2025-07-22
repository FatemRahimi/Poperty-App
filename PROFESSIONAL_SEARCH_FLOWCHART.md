# Professional Search Header & Location Search Strategy Flowchart

## Overview
This document outlines the complete flow for the professional search header and location search strategy, covering both frontend and backend functionality.

## Frontend Flow (UserDashboard & SearchFilterHeader)

```mermaid
flowchart TD
    A[User Dashboard Loads] --> B[SearchFilterHeader Component]
    B --> C[LocationSearch Component]
    C --> D[User Types in Search Input]
    
    D --> E{Input Length >= 2?}
    E -->|No| F[Wait for more input]
    E -->|Yes| G[Debounce Timer Starts]
    
    G --> H[1 Second Delay]
    H --> I[Trigger Professional Search]
    
    D --> J[User Presses Enter]
    J --> K[Clear Debounce Timer]
    K --> I
    
    I --> L[Call Backend Search API]
    L --> M[Set isSearching = true]
    M --> N[Show Loading State]
    
    N --> O[Backend Processes Search]
    O --> P[Receive Search Results]
    P --> Q[Set isSearching = false]
    Q --> R[Display Results in Dashboard]
    
    C --> S[Radius Dropdown]
    S --> T[User Changes Radius]
    T --> U[Update searchFilters.radius]
    U --> V[Trigger New Search with New Radius]
```

## Backend Flow (propertyRoutes.js - Search API)

```mermaid
flowchart TD
    A[Search API Request] --> B[Extract Query Parameters]
    B --> C[Get: q, radius, category, property_type, etc.]
    
    C --> D{Query Parameter Exists?}
    D -->|No| E[Return All Properties]
    D -->|Yes| F[Input Analysis Function]
    
    F --> G[analyzeSearchInput Function]
    G --> H{Input Type Detection}
    
    H -->|City Only| I[City Search Strategy]
    H -->|Postcode| J[Postcode Search Strategy]
    H -->|Partial Postcode| J
    H -->|Postcode Priority| J
    H -->|Area/Street| K[Area/Street Search Strategy]
    
    I --> L[Direct Database Query - Cities]
    L --> M[SELECT FROM properties WHERE city = input_value]
    M --> N[Show ALL properties in matching cities]
    N --> O[Include all statuses: approved, pending, rejected]
    O --> GG[Apply Additional Filters]
    
    J --> P[Geocoding Process]
    P --> Q[Call UK Postcodes API]
    Q --> R{Geocoding Successful?}
    R -->|Yes| S[Get Coordinates]
    R -->|No| T[Fallback to Text Search]
    
    S --> U[Geographic Radius Search]
    U --> V[Calculate Distance Formula]
    V --> W[WHERE distance <= radius_miles]
    
    T --> X[Text Search Fallback]
    X --> Y[WHERE p.zip_code ILIKE %input%]
    
    K --> Z[Enhanced Geocoding]
    Z --> AA[Call UK Places API]
    AA --> BB{Geocoding Successful?}
    BB -->|Yes| CC[Get Coordinates]
    BB -->|No| DD[Fallback to Text Search]
    
    CC --> U
    DD --> EE[Multi-field Text Search]
    EE --> FF[WHERE title OR description OR address OR city ILIKE %input%]
    
    W --> GG
    Y --> GG
    FF --> GG
    
    GG --> HH[Category Filter]
    GG --> II[Property Type Filter]
    GG --> JJ[Price Range Filter]
    GG --> KK[Bedroom Filter]
    GG --> LL[Status Filter]
    
    HH --> MM[Execute Final Query]
    II --> MM
    JJ --> MM
    KK --> MM
    LL --> MM
    
    MM --> NN[Return Results to Frontend]
    NN --> OO[Include Search Analytics]
    OO --> PP[Search Strategy Info]
    PP --> QQ[Input Analysis Results]
    QQ --> RR[Radius Used]
    RR --> SS[Results Count]
```

## Database City Suggestions Flow

```mermaid
flowchart TD
    A[User Types City Name] --> B[Input Length >= 3?]
    B -->|No| C[Wait for more input]
    B -->|Yes| D[Query Database for Cities]
    
    D --> E[SELECT DISTINCT city FROM properties]
    E --> F[WHERE city ILIKE %input%]
    F --> G[GROUP BY city]
    G --> H[ORDER BY property_count DESC]
    H --> I[LIMIT 8 suggestions]
    
    I --> J[Format Suggestions]
    J --> K[Display: "City Name (X properties)"]
    K --> L[No Icons - Clean UI]
    L --> M[Return Suggestions to Frontend]
    
    M --> N[User Selects City]
    N --> O[Direct Database Search]
    O --> P[No Geocoding Required]
    P --> Q[WHERE city = selected_city]
    Q --> R[Return All Properties in City]
```

## Input Analysis Logic

```mermaid
flowchart TD
    A[Input: searchQuery] --> B[Trim and Lowercase]
    B --> C{Check Postcode Pattern}
    
    C -->|Matches Full Postcode| D[Type: postcode]
    C -->|Matches Partial Postcode| E[Type: partial_postcode]
    C -->|No Match| F{Check City Pattern}
    
    F -->|Letters + Spaces Only| G[Type: city]
    F -->|Contains Postcode| H[Type: postcode_priority]
    F -->|Other| I[Type: area_street]
    
    D --> J[Return: postcode, value]
    E --> K[Return: partial_postcode, value]
    G --> L[Return: city, value - NO GEOCODING]
    H --> M[Return: postcode_priority, value]
    I --> N[Return: area_street, value]
```

## Search Strategy Decision Tree

```mermaid
flowchart TD
    A[Input Analysis Result] --> B{Input Type?}
    
    B -->|city| C[City-Only Strategy]
    B -->|postcode| D[Postcode Strategy]
    B -->|partial_postcode| D
    B -->|postcode_priority| D
    B -->|area_street| E[Area/Street Strategy]
    
    C --> F[Database Query: WHERE city = input]
    C --> G[Include ALL statuses]
    C --> H[No geocoding needed]
    C --> I[No geographic radius]
    
    D --> J[Geocoding: UK Postcodes API]
    D --> K[Get coordinates]
    D --> L[Geographic radius search]
    D --> M[Default: 3 miles]
    
    E --> N[Geocoding: UK Places API]
    E --> O[Get coordinates]
    E --> P[Geographic radius search]
    E --> Q[Default: 3 miles]
    
    F --> R[Return Results]
    G --> R
    H --> R
    I --> R
    
    J --> S{Geocoding Success?}
    S -->|Yes| T[Use coordinates + radius]
    S -->|No| U[Fallback: text search]
    
    N --> V{Geocoding Success?}
    V -->|Yes| W[Use coordinates + radius]
    V -->|No| X[Fallback: multi-field search]
    
    T --> R
    U --> R
    W --> R
    X --> R
```

## Radius Handling

```mermaid
flowchart TD
    A[Radius Parameter] --> B{Input Type?}
    
    B -->|City Search| C[No Radius Applied]
    B -->|Postcode/Area| D[Apply Radius Logic]
    
    C --> E[Return All Properties in City]
    
    D --> F{Radius Value?}
    F -->|Not Provided| G[Default: 3 miles]
    F -->|Provided| H[Use Provided Value]
    
    G --> I[Convert to Float]
    H --> I
    
    I --> J[Validate Range: 0.25 - 30 miles]
    J --> K{Valid Range?}
    
    K -->|Yes| L[Use Radius in Geographic Search]
    K -->|No| M[Use Default: 3 miles]
    
    L --> N[Distance Calculation]
    M --> N
    
    N --> O[WHERE distance <= radius_miles]
    O --> P[Return Properties Within Radius]
```

## Frontend State Management

```mermaid
flowchart TD
    A[UserDashboard State] --> B[searchQuery: string]
    A --> C[searchFilters: object]
    A --> D[isSearching: boolean]
    A --> E[searchResults: array]
    A --> F[searchAnalytics: object]
    
    C --> G[radius: string]
    C --> H[minPrice: string]
    C --> I[maxPrice: string]
    C --> J[minBeds: string]
    C --> K[maxBeds: string]
    C --> L[propertyType: string]
    
    D --> M[Loading Indicator]
    E --> N[Results Display]
    F --> O[Search Strategy Info]
    
    G --> P[Radius Dropdown - Only for Postcodes/Areas]
    P --> Q[User Changes Radius]
    Q --> R[Update State]
    R --> S[Trigger New Search]
```

## Error Handling

```mermaid
flowchart TD
    A[Search Request] --> B{API Call Success?}
    
    B -->|Yes| C[Process Results]
    B -->|No| D[Handle Error]
    
    D --> E[Network Error]
    D --> F[Server Error]
    D --> G[Invalid Response]
    
    E --> H[Show Network Error Message]
    F --> I[Show Server Error Message]
    G --> J[Show Invalid Response Message]
    
    H --> K[Retry Option]
    I --> K
    J --> K
    
    K --> L[User Can Retry Search]
    L --> A
    
    C --> M[Validate Results]
    M --> N{Results Valid?}
    
    N -->|Yes| O[Display Results]
    N -->|No| P[Show No Results Message]
    
    O --> Q[Update Dashboard]
    P --> R[Empty Results State]
```

## Performance Optimizations

```mermaid
flowchart TD
    A[User Input] --> B[Debounce Timer]
    B --> C[300ms Delay]
    C --> D[Clear Previous Timer]
    D --> E[Set New Timer]
    
    E --> F[Timer Expires]
    F --> G[Trigger Search]
    
    G --> H[Cancel Previous Request]
    H --> I[Make New Request]
    
    I --> J[Request in Progress]
    J --> K[User Types Again]
    
    K --> L[Cancel Current Request]
    L --> B
    
    J --> M[Request Complete]
    M --> N[Update Results]
```

## Database Query Optimization for Cities

```mermaid
flowchart TD
    A[City Search Parameters] --> B[Build City Query]
    
    B --> C[Input Analysis]
    C --> D{Search Type}
    
    D -->|City| E[Direct Database Query]
    D -->|Postcode| F[Complex Geographic Query]
    D -->|Text| G[ILIKE Search]
    
    E --> H[WHERE city = input_value]
    H --> I[No Geocoding Required]
    I --> J[No Distance Calculation]
    J --> K[Return All City Properties]
    
    F --> L[Coordinate Calculation]
    L --> M[Distance Formula]
    M --> N[Radius Comparison]
    
    G --> O[Multiple Field Search]
    O --> P[Title, Description, Address, City]
    
    K --> Q[Add Additional Filters]
    N --> Q
    P --> Q
    
    Q --> R[Category Filter]
    Q --> S[Property Type Filter]
    Q --> T[Price Filter]
    Q --> U[Bedroom Filter]
    Q --> V[Status Filter]
    
    R --> W[Execute Query]
    S --> W
    T --> W
    U --> W
    V --> W
    
    W --> X[Return Results]
    X --> Y[No Pagination for Cities]
    Y --> Z[Send to Frontend]
```

## Key Features Summary

### Frontend Features:
- ✅ Debounced search input (1 second delay)
- ✅ Enter key to search immediately
- ✅ Loading states during search
- ✅ Radius selection (0.25 to 30 miles, default 3) - Only for postcodes/areas
- ✅ Real-time search results
- ✅ Error handling and retry options
- ✅ Clean suggestions without icons

### Backend Features:
- ✅ Input type analysis (city, postcode, area/street)
- ✅ **City-only search (direct database query, NO geocoding)**
- ✅ Postcode geocoding with UK Postcodes API
- ✅ Area/street geocoding with UK Places API
- ✅ Geographic radius search (default 3 miles) - Only for postcodes/areas
- ✅ Postcode priority when both postcode and city entered
- ✅ Fallback to text search when geocoding fails
- ✅ Comprehensive filtering (category, type, price, bedrooms)
- ✅ Search analytics and strategy information

### Search Strategies:
1. **City Search**: Direct database query, all statuses, **NO GEOCODING**
2. **Postcode Search**: Geocoding + geographic radius
3. **Area/Street Search**: Geocoding + geographic radius
4. **Postcode Priority**: When both postcode and city present
5. **Fallback**: Text search when geocoding fails

### Database City Suggestions:
- ✅ Cities retrieved from properties table
- ✅ No external API calls for city suggestions
- ✅ Grouped by city with property counts
- ✅ Clean UI without icons
- ✅ Fast database-only queries

This flowchart represents the complete professional search system with **direct database city searches (no geocoding)**, comprehensive UK location handling, default 3-mile radius for postcodes/areas only, and intelligent search strategy selection based on input type. 