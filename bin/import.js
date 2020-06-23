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
    .replace(/<\/strong><strong>/g, '')
    .replace(/<h4[\s\S]*h4>/g, '')
    .replace(/\[youtube_sc\s+url=\"(.+?)\".*]/g, '$1')
    .replace(/<img.*src="https?:\/\/(?:www\.)?ampeatermusic\.com\/media\/(.+?)".*\/>/g, `<img src="${BASE_URL}/$1" />`)
    .replace(/<img.*src="https?:\/\/(?:www\.)?ampeatermusic\.com\/(.+?)".*\/>/g, '')
    .replace(/<div[^>]*>/g, '')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/div>/g, '')
    .replace(/<\/p>/g, '')
    .replace(/<a.*href="https?:\/\/(?:www\.)?ampeatermusic.com\/tag.*?<\/a>/g, '')
    .replace(/<a.*href="https?:\/\/(?:www\.)?ampeatermusic\.com\/audio\/(.+?)".*>(.*)<\/a>/g, '<a href="$1">$2</a>')
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
    .replace(/\n\n/g, '</p><p>')
    .replace(post.author, '');

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

  // create excerpt
  let [excerpt, ...rest] = post.content.split('\n\n');

  while (excerpt.length < 300 && !excerpt.includes('---')) {
    excerpt += `\n\n${rest.shift()}`;
  }

  if (rest.length) {
    post.content = `${excerpt}\n\n<!-- more -->\n\n${rest.join('\n\n')}`;
  }

  const media = (await s3.listObjectsV2({
    Bucket: 'ampeater',
    Prefix: `${post.slug}/`
  }).promise());

  const image = media.Contents.find(item => item.Size > 0 && (item.Key.endsWith('jpg') || item.Key.endsWith('png')));
  const tracks = media.Contents.filter(item => item.Size > 0 && item.Key.endsWith('mp3'));

  let string = `---
layout: post
title: "${post.title.replace(/\\([\s\S])|(")/g, "\\$1$2")}"
date: ${post.date}
permalink: ${post.slug}
author: ${post.author}
---
`;

  if (image) {
    const url = `${BASE_URL}/${image.Key}`;
    string += `[![${post.title}](${url})](${url})\n\n`;
  }

  string += `${post.content}`;

  if (tracks.length) {
    string += '\n\n---\n\n';
  }

  for (const track of tracks) {
    const trackTitle = track.Key.split('/').pop().replace(/(?:\d+ )?(.*).mp3/, '$1');
    string += `**${trackTitle}**\n\n`;
    string += `${BASE_URL}/${track.Key}\n\n`;
  }

  fs.writeFileSync(path.join(__dirname, '../_posts', `${post.date.split(' ')[0]}-${post.slug}.md`), string);
});