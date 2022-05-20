import puppeteer from 'puppeteer-core'
import 'dotenv/config'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
;(async () => {
  async function createBrowser() {
    return await puppeteer.launch({
      headless: true,
      devtools: false,
      executablePath: process.env.CHROME,
    })
  }

  const browser = await createBrowser()
  const urls = [process.env.BOOK1, process.env.BOOK2]

  try {
    // Create a new incognito browser context
    const context = await browser.createIncognitoBrowserContext()
    // Create a new page inside context.
    const page = await context.newPage()

    for (const url of urls) {
      await getPage(page, url)
    }

    console.log('Closing Puppeteer!!!!')
    await page.close()
  } catch (e) {
    console.error(e)
  } finally {
    await browser.close()
  }
})()

async function getPage(page: puppeteer.Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle0' })

  const bookName = (
    await page.$eval(
      'section.media-item div.row.mb-3 div.col-lg-8 h1.head span',
      (el) => el.textContent
    )
  )
    .split(' ')
    .join('_')

  //get image and write to disk
  const imgUrl = await page.$eval(
    'section.media-item div.row.mb-3 div.col-lg-4.d-none.d-sm-block img',
    (el) => el.getAttribute('src')
  )
  const imgRes = await fetch(imgUrl)
  const type = imgRes.headers.get('Content-Type').replace('image/', '')
  const img = await imgRes.arrayBuffer()
  fs.writeFileSync(`./audio/${bookName}.${type}`, Buffer.from(img))

  // extract audio links
  const audioUrls = await page.$$eval('#jp_container_1.player ul li', (els) =>
    els
      .map((el) => el.getAttribute('data-url'))
      .map((url: string) => `https:${url}`)
  )
  // get audio book names
  const audioNames = audioUrls.map((file) => file.match(/\d+\.mp3/i)[0])
  console.log(audioNames)

  // download and write audio files to disk
  const nothing = await Promise.all(
    audioUrls.map(async (url, i) => {
      const res = await fetch(url)
      if (res.ok) {
        const bin = await res.arrayBuffer()
        fs.writeFileSync(`./audio/${audioNames[i]}`, Buffer.from(bin))
      }
      return
    })
  )

  console.log(
    'All files have been downloaded and written to disk. Starting Concat!!!!!!!!!'
  )
  await ffmpegMerge(ffmpeg, bookName, audioNames)
  console.log(`${bookName} written to disk!!!!`)
  return
}

function ffmpegMerge(
  ffmpeg: (options?: ffmpeg.FfmpegCommandOptions) => ffmpeg.FfmpegCommand,
  bookName: string,
  audioNames: string[]
) {
  return new Promise((res, rej) => {
    try {
      //instantiate
      let ffmpegFiles = ffmpeg()
      // add input files
      for (const file of audioNames) {
        ffmpegFiles = ffmpegFiles.addInput(`./audio/${file}`)
      }
      // concat and print
      ffmpegFiles
        .mergeToFile(`./audio/${bookName}.mp3`)
        .on('error', (err) => {
          console.log(err)
        })
        .on('end', () => {
          // delete old files
          for (const file of audioNames) {
            fs.unlink(`./audio/${file}`, (err) => {
              if (err) console.log(err)
              console.log(`./audio/${file} was deleted`)
            })
          }
          console.log('FFmpeg Finished!')
          return res(true)
        })
    } catch (error) {
      console.log(error)
      return rej(error)
    }
  })
}
