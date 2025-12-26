const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const CourseScraper = require('./src/scraper/courseScraper');
const CourseGraph = require('./src/graph/graphBuilder');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

let courseGraph = new CourseGraph();
let coursesData = [];

async function loadCourseData() {
  try {
    const dataPath = path.join(__dirname, 'data', 'courses.json');
    const data = await fs.readFile(dataPath, 'utf-8');
    coursesData = JSON.parse(data);
    courseGraph.buildFromCourses(coursesData);
    console.log('Course data loaded successfully');
    console.log('Graph stats:', courseGraph.getStats());
  } catch (error) {
    console.log('No existing course data found. Run scraper first.');
  }
}

app.get('/api/graph', (req, res) => {
  const graphData = courseGraph.getGraphData();
  res.json(graphData);
});

app.get('/api/graph/department/:dept', (req, res) => {
  const dept = req.params.dept.toUpperCase();
  const nodes = courseGraph.getNodesByDepartment(dept);
  const nodeCodes = nodes.map(n => n.id);
  const edges = courseGraph.edges.filter(
    e => nodeCodes.includes(e.from) || nodeCodes.includes(e.to)
  );
  res.json({ nodes, edges });
});

app.get('/api/graph/subgraph', (req, res) => {
  const courseCodes = req.query.courses ? req.query.courses.split(',') : [];
  const depth = parseInt(req.query.depth) || 1;

  if (courseCodes.length === 0) {
    return res.status(400).json({ error: 'No courses specified' });
  }

  const subgraph = courseGraph.getSubgraph(courseCodes, depth);
  res.json(subgraph);
});

app.get('/api/course/:code', (req, res) => {
  const code = req.params.code.toUpperCase().replace('-', ' ');
  const course = coursesData.find(c => c.code === code);

  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }

  res.json(course);
});

app.get('/api/course/:code/prerequisites', (req, res) => {
  const code = req.params.code.toUpperCase().replace('-', ' ');
  const prerequisites = courseGraph.getPrerequisitesFor(code);
  res.json(prerequisites);
});

app.get('/api/course/:code/dependents', (req, res) => {
  const code = req.params.code.toUpperCase().replace('-', ' ');
  const dependents = courseGraph.getDependentsFor(code);
  res.json(dependents);
});

app.get('/api/stats', (req, res) => {
  res.json(courseGraph.getStats());
});

app.post('/api/scrape', async (req, res) => {
  try {
    const limit = req.body.limit || null;
    const scraper = new CourseScraper();

    res.json({ message: 'Scraping started', status: 'in_progress' });

    scraper.scrapeAll(limit).then(async (courses) => {
      await scraper.saveToFile();
      await loadCourseData();
      console.log('Scraping completed and data reloaded');
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/departments', (req, res) => {
  const departments = [...new Set(coursesData.map(c => c.department))].sort();
  res.json(departments);
});

loadCourseData().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
