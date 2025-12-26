class CourseGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addCourse(course) {
    if (!this.nodes.has(course.code)) {
      this.nodes.set(course.code, {
        id: course.code,
        label: course.code,
        name: course.name,
        department: course.department,
        description: course.description,
        url: course.url
      });
    }
  }

  addPrerequisiteEdge(fromCourse, toCourse) {
    this.edges.push({
      from: fromCourse,
      to: toCourse,
      type: 'prerequisite',
      label: 'prerequisite'
    });
  }

  addCorequisiteEdge(fromCourse, toCourse) {
    this.edges.push({
      from: fromCourse,
      to: toCourse,
      type: 'corequisite',
      label: 'corequisite'
    });
  }

  buildFromCourses(courses) {
    courses.forEach(course => {
      this.addCourse(course);
    });

    courses.forEach(course => {
      course.prerequisites.forEach(prereq => {
        this.addPrerequisiteEdge(prereq, course.code);
      });

      course.corequisites.forEach(coreq => {
        this.addCorequisiteEdge(coreq, course.code);
      });
    });
  }

  getGraphData() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges
    };
  }

  getNodesByDepartment(department) {
    return Array.from(this.nodes.values()).filter(
      node => node.department === department
    );
  }

  getPrerequisitesFor(courseCode) {
    return this.edges
      .filter(edge => edge.to === courseCode && edge.type === 'prerequisite')
      .map(edge => this.nodes.get(edge.from));
  }

  getDependentsFor(courseCode) {
    return this.edges
      .filter(edge => edge.from === courseCode && edge.type === 'prerequisite')
      .map(edge => this.nodes.get(edge.to));
  }

  getSubgraph(courseCodes, depth = 1) {
    const visited = new Set();
    const queue = courseCodes.map(code => ({ code, level: 0 }));

    while (queue.length > 0) {
      const { code, level } = queue.shift();

      if (visited.has(code) || level > depth) continue;
      visited.add(code);

      const connectedEdges = this.edges.filter(
        edge => edge.from === code || edge.to === code
      );

      connectedEdges.forEach(edge => {
        const nextCode = edge.from === code ? edge.to : edge.from;
        if (!visited.has(nextCode)) {
          queue.push({ code: nextCode, level: level + 1 });
        }
      });
    }

    const subgraphNodes = Array.from(visited)
      .map(code => this.nodes.get(code))
      .filter(node => node);

    const subgraphEdges = this.edges.filter(
      edge => visited.has(edge.from) && visited.has(edge.to)
    );

    return {
      nodes: subgraphNodes,
      edges: subgraphEdges
    };
  }

  getStats() {
    return {
      totalCourses: this.nodes.size,
      totalEdges: this.edges.length,
      prerequisiteEdges: this.edges.filter(e => e.type === 'prerequisite').length,
      corequisiteEdges: this.edges.filter(e => e.type === 'corequisite').length,
      departments: new Set(Array.from(this.nodes.values()).map(n => n.department)).size
    };
  }
}

module.exports = CourseGraph;
