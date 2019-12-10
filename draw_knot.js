const fs = require("fs");
const jsdom = require('jsdom');
const { JSDOM } = jsdom;


let debug = false;
let verbose = true;


//
// check intersection of the two segments
//
function isCrossing(segments0, segments1) {
  let [p0, p1] = segments0;
  let [p2, p3] = segments1;
  let [x0, y0] = p0;
  let [x1, y1] = p1;
  let [x2, y2] = p2;
  let [x3, y3] = p3;

  // bounding boxes test
  let b = Math.max(x0, x1) > Math.min(x2, x3) &&
          Math.min(x0, x1) < Math.max(x2, x3) &&
          Math.max(y0, y1) > Math.min(y2, y3) &&
          Math.min(y0, y1) < Math.max(y2, y3);

  if (b) {
    // cross product test
    let cp0 = (x2 - x0) * (y3 - y0) - (y2 - y0) * (x3 - x0);
    let cp1 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    let cp2 = (x0 - x2) * (y1 - y2) - (y0 - y2) * (x1 - x2);
    let cp3 = (x0 - x3) * (y1 - y3) - (y0 - y3) * (x1 - x3);
    return (cp0 * cp1 < 0) && (cp2 * cp3 < 0);
  }
  return false;
}


//
// round with precision 1/10^2
//
function round2(x) {
  return Math.round(x * 100) / 100;
}


//
// convert Catmull-Rom endpoints to cubic Bezier nodes
//
function catmullRomToBezier(endPoints) {
  let bezierNode = [];

  bezierNode.push(endPoints[0]);
  endPoints.forEach((p, i, a) => {
    let P0 = a[(i - 1 + a.length) % a.length]
    let P1 = p
    let P2 = a[(i + 1) % a.length]
    let P3 = a[(i + 2) % a.length]

    // Catmull-Rom to Bezier conversion (alpha=0)
    let Cb1x = P1[0] + (P2[0] - P0[0]) / 6
    let Cb1y = P1[1] + (P2[1] - P0[1]) / 6
    let Cb2x = P2[0] - (P3[0] - P1[0]) / 6
    let Cb2y = P2[1] - (P3[1] - P1[1]) / 6

    // push cubic bezier points
    bezierNode.push([Cb1x, Cb1y])
    bezierNode.push([Cb2x, Cb2y])
    bezierNode.push(P2)
  });

  return bezierNode;
}


//
// construct path string from bezier nodes
//
function pathBezier(bezierNode) {
  // construct path string
  let s_path = "";
  let x = bezierNode[0][0];
  let y = bezierNode[0][1];
  s_path += "M" + round2(x) + "," + round2(y) + "C";
  for (p of bezierNode.slice(1)) {
    x = p[0];
    y = p[1];
    s_path += round2(x) + "," + round2(y) + " ";
  }
  s_path += "Z";

  return s_path;
}


//
// create simple svg document with a Catmull-Rom curve
//
function draw_svg(endPoints, crossing, viewBox) {
  let splitSegments = true;

  // create document root and body
  const document = new JSDOM().window.document;
  const body = document.body;

  // create svg element
  const svgns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgns, "svg");
  svg.setAttribute("xmlns", svgns);
  svg.setAttribute("viewBox", viewBox);

  // create svg path element
  let bezierNode = catmullRomToBezier(endPoints);

  if (splitSegments) {
    // assign segment levels at crossings
    let segmentLevel = new Array(endPoints.length);
    let level = 0;
    for (let i = 0; i < segmentLevel.length; i++) {
      if (crossing.findIndex(e => (e == i)) < 0) {
        segmentLevel[i] = level;
      } else {
        level = 1 - level;
        segmentLevel[i] = level;
      }
    }
    if (verbose) {
      console.log("<!-- seg-level: " + segmentLevel + " -->");
    }

    // with bezier curve segments split
    for (let level of [0, 1]) {
      for (let i = 0; i < endPoints.length; i++) {
        // sort segments by levels
        if (segmentLevel[i] == level) {
          let p0 = bezierNode[i * 3];
          let p1 = bezierNode[i * 3 + 1];
          let p2 = bezierNode[i * 3 + 2];
          let p3 = bezierNode[i * 3 + 3];
          let s_path = "M" + round2(p0[0]) + "," + round2(p0[1]) + "C";
          s_path += round2(p1[0]) + "," + round2(p1[1]) + " ";
          s_path += round2(p2[0]) + "," + round2(p2[1]) + " ";
          s_path += round2(p3[0]) + "," + round2(p3[1]) + " ";

          let g = document.createElementNS(svgns, "g");
          let path = document.createElementNS(svgns, "path");
          path.setAttribute("style","fill:none;stroke:#ffffff;stroke-width:16px;");
          path.setAttribute("d", s_path);
          g.appendChild(path);
          svg.appendChild(g);

          g = document.createElementNS(svgns, "g");
          path = document.createElementNS(svgns, "path");
          path.setAttribute("style","fill:none;stroke:#000000;stroke-width:8px;");
          path.setAttribute("d", s_path);
          g.appendChild(path);
          svg.appendChild(g);
        }
      }
    }
  } else {
    // with bezier curve segments connected
    const path = document.createElementNS(svgns, "path");
    path.setAttribute("style","fill:none;stroke:#000000;stroke-width:4px;");
    path.setAttribute("d", pathBezier(bezierNode));
    svg.appendChild(path);
  }

  // construct svg document and output as text
  body.appendChild(svg);
  return document.body.innerHTML;
}


//
// cui main entry
//
if (process.argv.length < 3) {
  console.log("usage: node draw_knot.js svg_file");
  process.exit(1);
}


//
// read inkscape file (SVG) and find end points from "path"
//
fs.readFile(process.argv[2], 'utf8', function(error, data) {
  // obtain svg path string
  const dom = new JSDOM(data);
  const viewBox = dom.window.document
                .querySelector("svg")
                .getAttribute("viewBox");
  const path_d = dom.window.document
                .querySelector("svg path")
                .getAttribute("d");
  if (debug) {
    console.log("<!-- ");
    console.log("viewBox:" + viewBox);
    console.log("path d:");
    console.log(path_d);
    console.log(" -->");
  }

  // parse path string to get end points
  let pathSentence = path_d.match(/[mzlhvcsqta][0-9\-., ]*/gi)
  let phrase;
  let points;
  let endPoints = [];
  let x, y;
  let xCurrent = 0;
  let yCurrent = 0;
  let cmdPrev = "";
  let cmd = "";
  for (phrase of pathSentence) {
    cmdPrev = cmd;
    cmd = phrase[0];
    if (debug) {
      console.log("<!-- ");
      console.log("path d phrase:");
      console.log(phrase);
      console.log(" -->");
    }

    if (cmd === "m" || cmd === "l") {
      // move and lineTo
      points = phrase.slice(1)
                     .trim()
                     .split(/[\s,]+/)
      x = points.shift();
      y = points.shift();
      while (y != undefined) {
        xCurrent += +x;
        yCurrent += +y;
        //console.log("cur: (" + xCurrent + "," + yCurrent + ")");
        endPoints.push([+xCurrent, +yCurrent]);
        x = points.shift();
        y = points.shift();
      }
    }
    if (cmd === "M" || cmd === "L") {
      // move and lineTo (absolute)
      points = phrase.slice(1)
                     .trim()
                     .split(/[\s,]+/)
      x = points.shift();
      y = points.shift();
      while (y != undefined) {
        xCurrent = +x;
        yCurrent = +y;
        //console.log("cur: (" + xCurrent + "," + yCurrent + ")");
        endPoints.push([+xCurrent, +yCurrent]);
        x = points.shift();
        y = points.shift();
      }
    }
    if (cmd === "c") {
      // cubic Bezier
      points = phrase.slice(1)
                     .trim()
                     .split(/[\s,]+/)
      points = points.slice(4);  // skip x1, y1, x2, y2
      x = points.shift();
      y = points.shift();
      while (y != undefined) {
        //console.log("cur: (" + xCurrent + "," + yCurrent + ")");
        xCurrent += +x;
        yCurrent += +y;
        endPoints.push([+xCurrent, +yCurrent]);
        points = points.slice(4);  // skip x1, y1, x2, y2
        x = points.shift();
        y = points.shift();
      }
    }
    if (cmd === "C") {
      // cubic Bezier (absolute)
      points = phrase.slice(1)
                     .trim()
                     .split(/[\s,]+/)
      // cubic Bezier
      points = points.slice(4);  // skip x1, y1, x2, y2
      x = points.shift();
      y = points.shift();
      while (y != undefined) {
        //console.log("cur: (" + xCurrent + "," + yCurrent + ")");
        xCurrent = +x;
        yCurrent = +y;
        endPoints.push([+xCurrent, +yCurrent]);
        points = points.slice(4);  // skip x1, y1, x2, y2
        x = points.shift();
        y = points.shift();
      }
    }
    if (cmd === "z" || cmd === "Z") {
      if (cmdPrev === "c" || cmdPrev === "C") {
        endPoints.pop();  // remove the last bezier node if closed
      }
    }
  }

  // array of segments of indices
  let nPoints = endPoints.length;
  let segments = endPoints.map((p, i) => [p, endPoints[(i + 1) % nPoints]])
  if (verbose) {
    console.log("<!-- ");
    console.log("" + segments.length + " segments exist.");
    if (debug) {
      console.log(segments);
    }
    console.log(" -->");
  }

  // find crossing segmements
  crossing = [];
  for (let i = 0; i < nPoints - 2; i++) {
    for (let j = i + 2; j < Math.min(nPoints + i - 1, nPoints); j++) {
      if (isCrossing(segments[i], segments[j])) {
        crossing.push(i);
        crossing.push(j);
      }
    }
  }
  if (verbose) {
    console.log("<!-- ");
    console.log("crossing: " + crossing);
    console.log(" -->");
  }

  // draw closed spline using CatmullRom
  let svg_closed_spline = draw_svg(endPoints, crossing, viewBox);
  console.log(svg_closed_spline);
});

