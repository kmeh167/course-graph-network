const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
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
  const limit = parseInt(req.query.limit) || 500;
  const dept = req.query.dept;

  let graphData;

  if (dept) {
    // Get department-specific data plus cross-department prerequisites/corequisites
    const deptNodes = courseGraph.getNodesByDepartment(dept.toUpperCase());
    const deptNodeCodes = new Set(deptNodes.map(n => n.id));

    // Get all edges connected to department courses
    const relevantEdges = courseGraph.edges.filter(
      e => deptNodeCodes.has(e.from) || deptNodeCodes.has(e.to)
    );

    // Find prerequisite/corequisite courses from other departments
    const additionalNodeCodes = new Set();
    relevantEdges.forEach(edge => {
      if (!deptNodeCodes.has(edge.from)) additionalNodeCodes.add(edge.from);
      if (!deptNodeCodes.has(edge.to)) additionalNodeCodes.add(edge.to);
    });

    // Get the additional nodes (prerequisites/corequisites from other departments)
    const allGraphNodes = courseGraph.getGraphData().nodes;
    const additionalNodes = allGraphNodes.filter(n => additionalNodeCodes.has(n.id));

    // Combine department nodes with cross-department prerequisite/corequisite nodes
    const allNodes = [...deptNodes, ...additionalNodes];

    graphData = { nodes: allNodes, edges: relevantEdges };
  } else {
    // Get limited data to prevent browser freeze
    const allData = courseGraph.getGraphData();
    graphData = {
      nodes: allData.nodes.slice(0, limit),
      edges: allData.edges.filter(e =>
        allData.nodes.slice(0, limit).some(n => n.id === e.from || n.id === e.to)
      ),
      total: allData.nodes.length,
      showing: Math.min(limit, allData.nodes.length)
    };
  }

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

  // Add postrequisites (courses that require this course)
  const postrequisites = courseGraph.getDependentsFor(code);
  const postrequisiteData = postrequisites.map(node => {
    const postreqCourse = coursesData.find(c => c.code === node.id);
    const otherPrereqs = postreqCourse?.prerequisites.filter(p => p !== code) || [];

    // Check if the description contains "or" in the prerequisite section
    // Include "and/or" and standalone "or" as indicators of flexible prerequisites
    const description = postreqCourse?.description || '';
    const prereqIndex = description.toLowerCase().indexOf('prerequisite:');
    let hasOrInPrereqs = false;

    if (prereqIndex !== -1) {
      const prereqSection = description.substring(prereqIndex).toLowerCase();
      // Look for word "or" (including in "and/or")
      hasOrInPrereqs = /\bor\b/.test(prereqSection);
    }

    return {
      code: node.id,
      name: node.name,
      otherPrerequisites: otherPrereqs,
      hasOrInPrereqs: hasOrInPrereqs
    };
  });

  res.json({
    ...course,
    postrequisites: postrequisiteData
  });
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

// Scraping endpoint removed - data is now pre-scraped and committed to repository
// To update data: run `npm run scrape` locally, then commit and push data/courses.json

app.get('/api/departments', (req, res) => {
  const departments = [...new Set(coursesData.map(c => c.department))].sort();
  res.json(departments);
});

loadCourseData().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
