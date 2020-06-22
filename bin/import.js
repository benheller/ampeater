#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const AWS = require('aws-sdk');

const BASE_URL = 'https://ampeater.s3.amazonaws.com';

const turndownService = new TurndownService();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1',
});

const oldPosts = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/old_posts.json'), 'utf-8'));
const newPosts = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/new_posts.json'), 'utf-8'));

let posts = oldPosts.concat(newPosts);

function sanitize(str) {
  return str
    .replace(/<table[\s\S]*table>/g, '')
    .replace(/<h4[\s\S]*h4>/g, '')
    .replace(/<img[^>]*>/g, '')
    .replace(/<div[^>]*>/g, '')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/div>/g, '')
    .replace(/<\/p>/g, '')
    .replace(/<a href="http:\/\/ampeatermusic.com\/tag.*?<\/a>/g, '')
    .replace(/Â/g, ' ')
    .replace(/Ã/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/á©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/â€™/g, '\'')
    .replace(/â€¢/g, '-')
    .replace(/â€”/g, '-')
    .replace(/â€¦/g, '...')
    .replace(/â€˜/g, '\'')
    .replace(/â€”/g, '–')
    .replace(/â€“/g, '—')
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .trim();
}

posts.map(async post => {

  post.title = sanitize(post.title);
  post.content = sanitize(post.content);

  post.content = post.content
    .replace(/\r\n\r\n/g, '</p><p>')
    .replace(/\n\n/g, '</p><p>');

  post.content = '<p>' + post.content + '</p>';

  // strip empty HTML tags
  post.content = post.content.replace('<p></p>', '');

  // strip extra spaces
  post.content = post.content
    .replace('&nbsp;', ' ')
    .replace(//g, ' ') //u9d
    .replace(/\s\s+/g, ' ');

  // write to file...
  post.content = turndownService.turndown(post.content);

  const media = await s3.listObjectsV2({
    Bucket: 'ampeater',
    Prefix: post.slug
  }).promise();

  const image = media.Contents.find(item => !item.Key.endsWith('mp3'));
  const tracks = media.Contents.filter(item => item.Key.endsWith('mp3'));

  let string = `---
layout: post
title: "${post.title.replace(/\\([\s\S])|(")/g, "\\$1$2")}"
date: ${post.date}
permalink: ${post.slug}
---
`;

  if (image) {
    string += `![${post.title}](${BASE_URL}/${image.Key})

    `;
  }

  string += `${post.content}
  
  `;

  for (const track of tracks) {
    // TODO: add track title properly
    string += `${BASE_URL}/${track.Key}
    
    `;
  }

  fs.writeFileSync(path.join(__dirname, '../_posts', `${post.date.split(' ')[0]}-${post.slug}.md`), string);
});