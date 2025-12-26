# UIUC Course Graph Network

A web application that scrapes course data from the University of Illinois course catalog and visualizes the relationships between courses as an interactive graph network.

## Features

- **Web Scraping**: Automatically extracts course information including:
  - Course codes and names
  - Course descriptions
  - Prerequisites and corequisites (extracted from hyperlinks)

- **Graph Visualization**: Interactive network graph showing:
  - Courses as nodes
  - Prerequisites as solid directed edges
  - Corequisites as dashed directed edges

- **Interactive UI**:
  - Separate dropdown search for department code and course number
  - Click on nodes to focus and highlight connections
  - Clickable course references in descriptions
  - Real-time dimming of unrelated courses when a course is selected
  - Course information panel with full details

## Project Structure

```
prepost/
├── server.js                    # Express backend server
├── package.json                 # Project dependencies
├── src/
│   ├── scraper/
│   │   └── courseScraper.js    # Web scraper for UIUC course catalog
│   └── graph/
│       └── graphBuilder.js     # Graph data structure builder
├── public/
│   ├── index.html              # Frontend HTML
│   ├── styles.css              # Styling
│   └── app.js                  # Frontend JavaScript
└── data/
    └── courses.json            # Scraped course data (generated)
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to GitHub Pages + Render.

**Quick Summary:**
- Frontend: GitHub Pages (free)
- Backend: Render (free tier)
- Total cost: $0

## Local Development

1. Install Node.js (v14 or higher)

2. Install dependencies:
```bash
npm install
```

## Usage

### 1. Scrape Course Data

Run the scraper to collect course information:

```bash
npm run scrape
```

This will scrape the first 5 departments by default (for testing). The data will be saved to `data/courses.json`.

To scrape all departments, modify the script in `src/scraper/courseScraper.js` and change:
```javascript
await scraper.scrapeAll(5);  // Change to scrapeAll() for all departments
```

### 2. Start the Server

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 3. Use the Web Interface

Open your browser and navigate to `http://localhost:3000`

**Features:**
- Use the department and course number dropdowns to search for courses
- Click on any course node in the graph to see its details
- When a course is selected:
  - The selected course is highlighted in orange at the center
  - Prerequisites and corequisites are highlighted in green
  - Other courses are dimmed
- Click on course codes in the description to jump to those courses
- Use "Reset View" to restore the full graph

## API Endpoints

- `GET /api/graph` - Get full graph data
- `GET /api/graph/department/:dept` - Get courses for a specific department
- `GET /api/graph/subgraph?courses=CS225,CS173&depth=1` - Get subgraph around specific courses
- `GET /api/course/:code` - Get detailed info for a course
- `GET /api/course/:code/prerequisites` - Get prerequisites for a course
- `GET /api/course/:code/dependents` - Get courses that depend on this course
- `GET /api/stats` - Get graph statistics
- `GET /api/departments` - Get list of all departments
- `POST /api/scrape` - Trigger new scrape (body: `{"limit": 5}`)

## How It Works

### Web Scraping
The scraper navigates the UIUC course catalog structure:
- Fetches department list from the main index page
- For each department, visits the department page (e.g., `/courses-of-instruction/cs/`)
- Extracts course blocks from the HTML structure
- Parses prerequisites and corequisites from hyperlinks in course descriptions
- Distinguishes corequisites by looking for "concurrent registration" text

### Graph Building
- Each course becomes a node in the graph
- Prerequisites create directed edges pointing to the course
- Corequisites create dashed directed edges
- The graph supports queries for subgraphs, dependencies, and course relationships

### Visualization
- Uses vis-network library for interactive graph rendering
- Physics simulation for automatic layout
- Color coding: Blue (default), Orange (selected), Green (connected), Gray (dimmed)
- Real-time updates when clicking nodes or searching

## Technologies Used

- **Backend**: Node.js, Express
- **Scraping**: Axios, Cheerio
- **Frontend**: Vanilla JavaScript, vis-network
- **Data Storage**: JSON files

## Notes

- The scraper includes a 500ms delay between requests to be respectful to the server
- Course codes are normalized to format "DEPT NUM" (e.g., "CS 225")
- The graph visualization performs best with smaller subsets of data
- For production use, consider adding a database instead of JSON files

## Future Enhancements

- Add filtering by course level (100-level, 200-level, etc.)
- Export graph as image
- Course sequence planning tool
- Search by course name (not just code)
- Hierarchical layout option for prerequisite chains
- Integration with course scheduling data
