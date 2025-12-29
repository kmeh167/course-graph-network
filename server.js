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

    // Check if the description contains "or" or "one of" in the prerequisite section
    // Include "and/or", standalone "or", and "one of" as indicators of flexible prerequisites
    const description = postreqCourse?.description || '';
    const prereqIndex = description.toLowerCase().indexOf('prerequisite:');
    let hasOrInPrereqs = false;

    if (prereqIndex !== -1) {
      const prereqSection = description.substring(prereqIndex).toLowerCase();
      // Look for word "or" (including in "and/or") or "one of"
      hasOrInPrereqs = /\bor\b/.test(prereqSection) || /\bone of\b/.test(prereqSection);
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

app.get('/api/no-prerequisites', (req, res) => {
  const noPrereqCourses = [];

  coursesData.forEach(course => {
    const description = course.description || '';
    const prereqIndex = description.indexOf('Prerequisite:');

    // Case 1: No "Prerequisite:" keyword at all - truly no prerequisites
    if (prereqIndex === -1) {
      if (course.prerequisites.length === 0 && course.corequisites.length === 0) {
        noPrereqCourses.push({
          code: course.code,
          name: course.name,
          department: course.department,
          hasPrereqKeyword: false,
          prereqText: null
        });
      }
    } else {
      // Case 2: "Prerequisite:" keyword exists
      // Check if there are actual course links after it
      if (course.prerequisites.length === 0 && course.corequisites.length === 0) {
        // Extract the text after "Prerequisite:" up to the next section or end
        const prereqSection = description.substring(prereqIndex);
        // Find the end of the prerequisite section (look for common section markers)
        const sectionEndMarkers = [
          prereqSection.indexOf('Credit Hours:'),
          prereqSection.indexOf('Same as'),
          prereqSection.length
        ].filter(idx => idx !== -1);
        const sectionEnd = Math.min(...sectionEndMarkers);

        let prereqText = prereqSection.substring('Prerequisite:'.length, sectionEnd).trim();

        // Clean up the text (remove extra whitespace)
        prereqText = prereqText.replace(/\s+/g, ' ').trim();

        // Limit length for display
        if (prereqText.length > 150) {
          prereqText = prereqText.substring(0, 150) + '...';
        }

        noPrereqCourses.push({
          code: course.code,
          name: course.name,
          department: course.department,
          hasPrereqKeyword: true,
          prereqText: prereqText || 'See course description'
        });
      }
    }
  });

  // Sort alphabetically by code
  noPrereqCourses.sort((a, b) => a.code.localeCompare(b.code));

  res.json(noPrereqCourses);
});

app.post('/api/suggest-courses', (req, res) => {
  const completedCourses = req.body.completedCourses || [];
  const orGroups = req.body.orGroups || null;

  // Helper function to check if a prerequisite is satisfied
  const isPrereqSatisfied = (prereq) => {
    if (orGroups) {
      // OR logic: check if ANY group contains this prerequisite
      return orGroups.some(group => group.includes(prereq));
    } else {
      // AND logic: check if the prerequisite is in the completed set
      return completedSet.has(prereq);
    }
  };

  const completedSet = new Set(completedCourses.map(c => c.toUpperCase()));

  // Categorize all courses
  const suggestions = {
    canTake: [],           // All prerequisites met
    partialPrereqs: [],    // Some prerequisites met
    noPrereqs: []          // No prerequisites required
  };

  coursesData.forEach(course => {
    // Skip if already completed (check all OR groups if applicable)
    const isAlreadyCompleted = orGroups
      ? orGroups.some(group => group.includes(course.code))
      : completedSet.has(course.code);

    if (isAlreadyCompleted) return;

    const prereqs = course.prerequisites || [];
    const coreqs = course.corequisites || [];

    if (prereqs.length === 0 && coreqs.length === 0) {
      // No prerequisites required
      suggestions.noPrereqs.push({
        code: course.code,
        name: course.name,
        department: course.department,
        prerequisites: [],
        corequisites: [],
        missingPrereqs: [],
        missingCoreqs: []
      });
    } else {
      // Check which prerequisites are met
      const missingPrereqs = prereqs.filter(p => !isPrereqSatisfied(p));
      const missingCoreqs = coreqs.filter(c => !isPrereqSatisfied(c));
      const completedPrereqs = prereqs.filter(p => isPrereqSatisfied(p));
      const completedCoreqs = coreqs.filter(c => isPrereqSatisfied(c));

      if (missingPrereqs.length === 0 && missingCoreqs.length === 0) {
        // All prerequisites met
        suggestions.canTake.push({
          code: course.code,
          name: course.name,
          department: course.department,
          prerequisites: prereqs,
          corequisites: coreqs,
          missingPrereqs: [],
          missingCoreqs: []
        });
      } else if (completedPrereqs.length > 0 || completedCoreqs.length > 0) {
        // Partial prerequisites met - at least one prerequisite/corequisite completed
        suggestions.partialPrereqs.push({
          code: course.code,
          name: course.name,
          department: course.department,
          prerequisites: prereqs,
          corequisites: coreqs,
          missingPrereqs,
          missingCoreqs
        });
      }
      // If no prerequisites are completed at all, don't include in suggestions
    }
  });

  // Sort each category alphabetically by code
  suggestions.canTake.sort((a, b) => a.code.localeCompare(b.code));
  suggestions.partialPrereqs.sort((a, b) => a.code.localeCompare(b.code));
  suggestions.noPrereqs.sort((a, b) => a.code.localeCompare(b.code));

  res.json(suggestions);
});

loadCourseData().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
