#! /usr/bin/env node 
const url = require('url')
const fetch = require('node-fetch')
const express = require('express')
const { loadImage, createCanvas } = require('canvas')
const stream = require('stream')

const app = express()

const drawMapWithCourse = (img, coordinatesArray) => {
    const canvas =  createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
  
    // draw a background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, Math.round(canvas.width), Math.round(canvas.height));
  
    const weight = 4;
  
    const canvas2 = createCanvas(canvas.width, canvas.height);
    const ctx2 = canvas2.getContext('2d');
      
    ctx2.lineWidth = weight;
    const circleSize = 20
    ctx2.strokeStyle = 'purple';
    ctx2.beginPath();
    coordinatesArray.forEach(coordinates => {
      for(let i=0; i < coordinates.length-1; i++) {
          // avoid division by zero
          if (coordinates[i][0] === coordinates[i+1][0]) {
              coordinates[i][0] -= 0.0001
          }

          var StartFromA = coordinates[i][0] < coordinates[i+1][0]
          var ptA = StartFromA ? coordinates[i] : coordinates[i+1]
          var ptB = StartFromA ? coordinates[i+1] : coordinates[i]
          var angle = Math.atan((-ptB[1] + ptA[1]) / (ptB[0] - ptA[0]))
          if (i === 0) {
              let ptS = ptB;
              if (StartFromA) {
                  ptS = ptA;
              }
              const teta = angle + 2 * Math.PI / 3
              const beta = angle - 2 * Math.PI / 3
              
              ctx2.moveTo(
                  Math.round(ptS[0] - (StartFromA ? -1: 1) * circleSize * Math.cos(angle)),
                  Math.round((StartFromA ? 1: -1) * circleSize * Math.sin(angle) - ptS[1])
              )
              ctx2.lineTo(
                  Math.round(ptS[0] - (StartFromA ? -1: 1) * circleSize * Math.cos(teta)),
                  Math.round((StartFromA ? 1: -1) * circleSize * Math.sin(teta) - ptS[1])
              )
              ctx2.lineTo(
                  Math.round(ptS[0] - (StartFromA ? -1: 1) * circleSize * Math.cos(beta)),
                  Math.round((StartFromA ? 1: -1) * circleSize * Math.sin(beta) - ptS[1])
              )
              ctx2.lineTo(
                  Math.round(ptS[0] - (StartFromA ? -1: 1) * circleSize * Math.cos(angle)),
                  Math.round((StartFromA ? 1: -1) * circleSize * Math.sin(angle) - ptS[1])
              )
          }
          ctx2.moveTo(
              Math.round(ptA[0] + circleSize * Math.cos(angle)),
              Math.round(-ptA[1] + circleSize * Math.sin(angle))
          )
          ctx2.lineTo(
              Math.round(ptB[0] - circleSize * Math.cos(angle)),
              Math.round(-ptB[1] - circleSize * Math.sin(angle))
          )
          let ptO = ptA
          if (StartFromA) {
              ptO = ptB
          }
          ctx2.moveTo(
              Math.round(ptO[0] + circleSize),
              Math.round(-ptO[1])
          )
          ctx2.arc(coordinates[i+1][0], -coordinates[i+1][1], circleSize, 0, 2*Math.PI)
          if (i === coordinates.length-2) {
              ctx2.moveTo(
                  Math.round(ptO[0] + circleSize-5),
                  Math.round(-ptO[1])
              )
              ctx2.arc(coordinates[i+1][0], -coordinates[i+1][1], circleSize-10, 0, 2*Math.PI)    
          }
      }
    })
    ctx2.stroke();
    ctx.globalAlpha = 0.7;
    ctx.drawImage(canvas2, 0, 0);
    return canvas;
};

const getClasses = async (req, res, next) => {
  const eventUrl = req.body.url;
  const parsedUrl = url.parse(eventUrl, true)
  const gadgetRootPath = parsedUrl.pathname.split('/').slice(0, -2).join('/') + "/kartat"
  const eventId = parseInt(parsedUrl.query.id, 10);
  const dataFile = parsedUrl.protocol + '//' + parsedUrl.host + '/' + gadgetRootPath + "/sarjat_" + eventId + ".txt";
  console.log(dataFile)
  const classesFileRequest = await fetch(dataFile)
  if (classesFileRequest.status != 200) {
    return res.status(200).send({error: "Cannot access classes file"})
  }
  const classesFile = await classesFileRequest.text();
  console.log(classesFile)
  const lines = classesFile.split('\n').map((l) => l.trim()).filter(Boolean)
  const classes = lines.map((line) => {
    const data = line.split('|');
    return [data[0], data.slice(1).join('|')]
  }).filter(Boolean)
  return res.status(200).send({classes, eventUrl: eventUrl})
}

const getMap = async (req, res, next) => {
  const eventUrl = req.body.url;
  console.log(eventUrl)
  if (!eventUrl  || !req.body.classId) {
    return res.status(200).send({error: "Missing parameters"})
  }
  const parsedUrl = url.parse(eventUrl, true)
  const gadgetRootPath = parsedUrl.pathname.split('/').slice(0, -2).join('/') + "/kartat"
  const eventId = parseInt(parsedUrl.query.id, 10);

  const cFileUrl = parsedUrl.protocol + '//' + parsedUrl.host + '/' + gadgetRootPath + "/kilpailijat_" + eventId + ".txt";
  console.log(cFileUrl)
  const competitorFileRequest = await fetch(cFileUrl)
  if (competitorFileRequest.status != 200) {
    return res.status(200).send({error: "Cannot access competitor file"})
  }
  const cFile = await competitorFileRequest.text();
  const clines = cFile.split('\n').map((l) => l.trim()).filter(Boolean)
  const routesIdsRaw = clines.map((line) => {
    return line.split('|');
  }).filter((d) => {
    return d?.[5] == req.body.classId
  }).map((d) => d?.[6])
  const routesIds = [...new Set(routesIdsRaw)];
  if (!routesIds.length) {
    return res.status(200).send({error: "Cannot find routes in competitors file"})
  }
  const dataFile = parsedUrl.protocol + '//' + parsedUrl.host + '/' + gadgetRootPath + "/ratapisteet_" + eventId + ".txt";
  console.log(dataFile)
  const routesFileRequest = await fetch(dataFile)
  if (routesFileRequest.status != 200) {
    return res.status(200).send({error: "Cannot access routes file"})
  }
  const routesFile = await routesFileRequest.text();
  console.log(routesFile)
  const lines = routesFile.split('\n').map((l) => l.trim()).filter(Boolean)
  const routesData = lines.map((line) => {
    const data = line.split('|');
    return [data[0], data.slice(1).join('|')]
  }).filter((d) => {
    return routesIds.includes(d?.[0])
  }).map((d) => d?.[1])
  if (!routesData.length) {
    return res.status(200).send({error: "Cannot find routes in routes file"})
  }
  const coordinates = routesData.map(routeData => routeData.split('N').map((xy) => xy && xy.split(';').map((x) => parseInt(x, 10))).filter(Boolean))
  console.log(coordinates)
  
  const mapListFileURL = parsedUrl.protocol + '//' + parsedUrl.host + '/' + gadgetRootPath + "/kisat.txt";
  const mapFileRequest = await fetch(mapListFileURL)

  if (mapFileRequest.status != 200) {
    return res.status(200).send({error: "Cannot access routes file"})
  }
  const mapListFile = await mapFileRequest.text();
  console.log(mapListFile)
  const klines = mapListFile.split('\n').map((l) => l.trim()).filter(Boolean)
  const mapId = klines.map((line) => {
    return line.split('|');
  }).find((d) => {
    return d?.[0] == eventId
  })?.[1]
  console.log(mapId)
  
  const mapURL = parsedUrl.protocol + '//' + parsedUrl.host + '/' + gadgetRootPath + "/" + parseInt(mapId, 10) + ".jpg";
  const mapImg = await loadImage(mapURL)
  const resultImg = drawMapWithCourse(mapImg, coordinates)
  const buffer = resultImg.toBuffer('image/jpeg', 0.8)
  const mime = 'image/jpeg'
  const filename = `map.jpg`
  var readStream = new stream.PassThrough()
  readStream.end(buffer)
  res.set('Content-disposition', 'attachment; filename="' + filename.replace(/\\/g, '_').replace(/"/g, '\\"') + '"')
  res.set('Content-Type', mime)
  readStream.pipe(res)
}

app.use(express.urlencoded({extended: true}))
app.use(express.json())

app.post('/api/get-classes', getClasses)
app.post('/api/get-map', getMap)

module.exports = app
