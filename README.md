# UIUC Course Graph Network

A web application that scrapes course data from the University of Illinois course catalog and visualizes the relationships between courses as an interactive graph network.

## Features

- **Intelligent Web Scraping**: Automatically extracts course information including:
  - Course codes and names
  - Course descriptions
  - Prerequisites and corequisites (extracted from hyperlinks)
  - Excludes courses mentioned in negative contexts ("cannot be taken concurrently", "credit is not given", etc.)
  - Filters out self-references and "same as" equivalents

- **Interactive Graph Visualization**:
  - Department-focused view with color-coded prerequisite/corequisite highlighting
  - Prerequisites shown in blue, corequisites in green, postrequisites in purple
  - Click any course to see its full prerequisite chain
  - Toggle to hide/show non-related courses
  - Automatic layout with vis-network physics simulation

- **Course Suggestion System**:
  - Find courses you can take based on completed prerequisites
  - Support for AND logic (comma-separated): Find courses requiring ALL listed courses
  - Support for OR logic (OR-separated): Find courses requiring ANY listed courses
  - Results categorized by readiness: ready to take, partially ready, no prerequisites required

- **No Prerequisites Panel**:
  - Permanent side panel showing courses with no prerequisites
  - Displays special requirements (consent of instructor, class standing, etc.)
  - Instantly accessible for course planning

- **Postrequisite Analysis**:
  - See what courses you can take after completing a given course
  - Identifies courses with flexible "or" requirements
  - Shows other prerequisites needed for each postrequisite

- **Smart Search & Navigation**:
  - Filter by department with cross-department prerequisite inclusion
  - Search by course number within departments
  - Clickable course codes throughout the interface
  - Real-time course information panel

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

## How to Use the Website

Once the website is loaded (whether locally or on Render), you can interact with it in several ways:

### Basic Navigation

1. **Department Filter**
   - Use the "Filter by Department" dropdown to select a specific department (e.g., CS, MATH, ECE)
   - Click "Apply Filter" to view only courses from that department
   - This shows the department's courses plus any cross-department prerequisites/corequisites

2. **Course Search**
   - After selecting a department, use "Search Course Number" to find a specific course
   - Click "Find Course" to focus on that course in the graph
   - The course will be highlighted with its prerequisites (blue), corequisites (green), and postrequisites (purple)

3. **Course Suggestions**
   - Enter courses in the "Completed Courses" field to find related courses:
     - **Comma-separated** (e.g., "CS 225, MATH 221"): Find courses that require ALL listed courses as prerequisites
     - **OR-separated** (e.g., "CS 173 or MATH 213"): Find courses that require ANY of the listed courses
   - Results are categorized as:
     - ✓ **Ready to Take**: All prerequisites met
     - ◐ **Partially Ready**: Some prerequisites met (shows what's still needed)
     - ○ **No Prerequisites Required**: Open to all students

### Interactive Graph Features

- **Click on course nodes** to see detailed information in the right panel
- **Color coding**:
  - 🔴 Orange: Selected course
  - 🔵 Blue: Prerequisites (courses you need to take first)
  - 🟢 Green: Corequisites (courses to take concurrently)
  - 🟣 Purple: Postrequisites (courses you can take after)
  - ⚪ Gray: Other courses in the department

- **Course links are clickable**: In descriptions and lists, click any course code to jump to that course
- **Toggle visibility**: Use "Hide/Show Other Courses" to focus only on the selected course and its connections
- **Reset View**: Click "Reset View" to restore the full graph

### Side Panel: No Prerequisites Required

- The left panel shows courses that have no prerequisites
- These courses are available to all students
- Some may have special requirements (consent of instructor, class standing, etc.) shown below the course name
- Click any course in this list to view it in the graph

## API Endpoints

- `GET /api/graph` - Get full graph data (limited to 500 courses by default)
  - Query params: `limit` (number), `dept` (department code for filtering)
- `GET /api/graph/department/:dept` - Get courses for a specific department
- `GET /api/graph/subgraph?courses=CS225,CS173&depth=1` - Get subgraph around specific courses
- `GET /api/course/:code` - Get detailed info for a course including postrequisites
- `GET /api/course/:code/prerequisites` - Get prerequisites for a course
- `GET /api/course/:code/dependents` - Get courses that depend on this course
- `GET /api/stats` - Get graph statistics (total courses, edges, departments)
- `GET /api/departments` - Get list of all departments
- `GET /api/no-prerequisites` - Get courses with no prerequisites (with special requirement text)
- `POST /api/suggest-courses` - Get course suggestions based on completed courses
  - Body: `{"completedCourses": ["CS 225", "MATH 221"], "orGroups": null}`

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
