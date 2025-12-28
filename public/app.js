let network = null;
let allNodes = [];
let allEdges = [];
let coursesData = [];

const API_BASE = CONFIG.API_BASE;

const nodes = new vis.DataSet();
const edges = new vis.DataSet();

async function init() {
    await loadGraphData();
    initNetwork();
    populateSearchDropdowns();
    setupEventListeners();
    updateStats();
}

async function loadGraphData() {
    try {
        const response = await fetch(`${API_BASE}/graph`);
        const data = await response.json();

        allNodes = data.nodes.map(node => ({
            id: node.id,
            label: node.id,
            title: `${node.id}: ${node.name}`,
            color: {
                background: '#13294b',
                border: '#0d1d33',
                highlight: {
                    background: '#e84a27',
                    border: '#c23d1f'
                }
            },
            font: { color: '#ffffff', size: 12 },
            data: node
        }));

        allEdges = data.edges.map((edge, index) => ({
            id: index,
            from: edge.from,
            to: edge.to,
            arrows: 'to',
            color: {
                color: edge.type === 'prerequisite' ? '#666666' : '#4CAF50',
                highlight: '#e84a27'
            },
            width: edge.type === 'prerequisite' ? 1 : 2,
            dashes: edge.type === 'corequisite',
            title: edge.type
        }));

        nodes.clear();
        edges.clear();
        nodes.add(allNodes);
        edges.add(allEdges);

        const coursesResponse = await fetch(`${API_BASE}/graph`);
        const coursesGraphData = await coursesResponse.json();
        coursesData = coursesGraphData.nodes;

    } catch (error) {
        console.error('Error loading graph data:', error);
    }
}

function initNetwork() {
    const container = document.getElementById('network');
    const data = { nodes, edges };

    const options = {
        layout: {
            improvedLayout: true,
            hierarchical: {
                enabled: false
            }
        },
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -8000,
                springConstant: 0.04,
                springLength: 95
            },
            stabilization: {
                iterations: 200
            }
        },
        interaction: {
            hover: true,
            navigationButtons: true,
            keyboard: true
        },
        nodes: {
            shape: 'dot',
            size: 15
        }
    };

    network = new vis.Network(container, data, options);

    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            focusOnCourse(nodeId);
        } else {
            resetHighlight();
        }
    });
}

function populateSearchDropdowns() {
    const deptCodes = new Set();
    const courseNumbers = new Map();

    allNodes.forEach(node => {
        const parts = node.id.split(' ');
        if (parts.length === 2) {
            const [dept, num] = parts;
            deptCodes.add(dept);

            if (!courseNumbers.has(dept)) {
                courseNumbers.set(dept, new Set());
            }
            courseNumbers.get(dept).add(num);
        }
    });

    const deptSelect = document.getElementById('deptCodeSelect');
    const sortedDepts = Array.from(deptCodes).sort();
    sortedDepts.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        deptSelect.appendChild(option);
    });

    deptSelect.addEventListener('change', () => {
        const numSelect = document.getElementById('courseNumSelect');
        numSelect.innerHTML = '<option value="">Course Number</option>';

        const selectedDept = deptSelect.value;
        if (selectedDept && courseNumbers.has(selectedDept)) {
            const numbers = Array.from(courseNumbers.get(selectedDept)).sort();
            numbers.forEach(num => {
                const option = document.createElement('option');
                option.value = num;
                option.textContent = num;
                numSelect.appendChild(option);
            });
        }
    });
}

function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', () => {
        const dept = document.getElementById('deptCodeSelect').value;
        const num = document.getElementById('courseNumSelect').value;

        if (dept && num) {
            const courseCode = `${dept} ${num}`;
            focusOnCourse(courseCode);
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        resetHighlight();
        network.fit();
    });
}

async function focusOnCourse(courseCode) {
    try {
        const response = await fetch(`${API_BASE}/course/${courseCode.replace(' ', '-')}`);
        const courseData = await response.json();

        highlightCourseAndConnections(courseCode);
        displayCourseInfo(courseData);
        network.focus(courseCode, {
            scale: 1.5,
            animation: true
        });

    } catch (error) {
        console.error('Error fetching course data:', error);
    }
}

function highlightCourseAndConnections(courseCode) {
    const connectedNodes = new Set([courseCode]);
    const connectedEdgeIds = [];

    allEdges.forEach((edge, index) => {
        if (edge.from === courseCode) {
            connectedNodes.add(edge.to);
            connectedEdgeIds.push(index);
        }
        if (edge.to === courseCode) {
            connectedNodes.add(edge.from);
            connectedEdgeIds.push(index);
        }
    });

    const updatedNodes = allNodes.map(node => {
        if (node.id === courseCode) {
            return {
                ...node,
                color: {
                    background: '#e84a27',
                    border: '#c23d1f'
                },
                font: { color: '#ffffff', size: 14, bold: true },
                size: 25
            };
        } else if (connectedNodes.has(node.id)) {
            return {
                ...node,
                color: {
                    background: '#4CAF50',
                    border: '#388E3C'
                },
                font: { color: '#ffffff', size: 12 }
            };
        } else {
            return {
                ...node,
                color: {
                    background: '#cccccc',
                    border: '#999999'
                },
                font: { color: '#666666', size: 10 },
                opacity: 0.3
            };
        }
    });

    nodes.clear();
    nodes.add(updatedNodes);
}

function resetHighlight() {
    nodes.clear();
    nodes.add(allNodes);

    document.getElementById('courseInfo').innerHTML =
        '<p>Click on a course node or search for a course to see details</p>';
}

function displayCourseInfo(course) {
    const infoDiv = document.getElementById('courseInfo');

    let prereqHtml = '<p>None</p>';
    if (course.prerequisites && course.prerequisites.length > 0) {
        prereqHtml = '<ul>' + course.prerequisites.map(prereq =>
            `<li><span class="course-link" onclick="focusOnCourse('${prereq}')">${prereq}</span></li>`
        ).join('') + '</ul>';
    }

    let coreqHtml = '<p>None</p>';
    if (course.corequisites && course.corequisites.length > 0) {
        coreqHtml = '<ul>' + course.corequisites.map(coreq =>
            `<li><span class="course-link" onclick="focusOnCourse('${coreq}')">${coreq}</span></li>`
        ).join('') + '</ul>';
    }

    let description = course.description || 'No description available';

    const coursePattern = /([A-Z]{2,4})\s*(\d{3})/g;
    description = description.replace(coursePattern, (match) => {
        const normalized = match.replace(/\s+/g, ' ');
        return `<span class="course-link" onclick="focusOnCourse('${normalized}')">${normalized}</span>`;
    });

    infoDiv.innerHTML = `
        <h4 class="course-code">${course.code}</h4>
        <h5>${course.name}</h5>
        <p><strong>Department:</strong> ${course.department}</p>

        <h4>Description</h4>
        <p>${description}</p>

        <h4>Prerequisites</h4>
        ${prereqHtml}

        <h4>Corequisites</h4>
        ${coreqHtml}
    `;
}

async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();

        document.getElementById('stats').innerHTML = `
            ${stats.totalCourses} courses |
            ${stats.prerequisiteEdges} prerequisite connections |
            ${stats.corequisiteEdges} corequisite connections |
            ${stats.departments} departments
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

window.addEventListener('DOMContentLoaded', init);
