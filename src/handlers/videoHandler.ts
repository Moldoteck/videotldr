import Context from '@/models/Context'
import { countUsers } from '@/models/User'
import { Message, ReplyMessage } from '@grammyjs/types'
import he = require('he')
var ndl = require('needle')
const youtubedl = require('youtube-dl-exec')
var fs = require('fs')
const crypto = require('crypto')

const usr_data = './usr_data/'

//extract video id number from youtube url
function extractID(url: string) {
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1].split('?')[0]
  } else if (url.includes('watch?v=')) {
    return url.split('watch?v=')[1].split('?')[0]
  }
}

export async function handleMessage(ctx: Context) {
  if (ctx.message) {
    handleVideo(ctx, ctx.message, ['channel', 'group', 'supergroup'])
  }
}

export async function handleReply(ctx: Context) {
  if (ctx.message) {
    if (ctx.message.reply_to_message) {
      handleVideo(ctx, ctx.message.reply_to_message, ['private'])
    }
  }
}

export async function handleVideo(
  ctx: Context,
  message: Message | ReplyMessage,
  chat_type_ignore: Array<string>
) {
  if (ctx.dbuser.smmry_api == null || ctx.dbuser.smmry_api == '') {
    ctx
      .reply('You need to set your smmry api key first. Please see /help')
      .catch((e) => console.log(e))
    return
  }

  if (ctx.chat && chat_type_ignore.includes(ctx.chat.type)) {
    if (chat_type_ignore.includes('private')) {
      ctx
        .reply(`This feature is not available in ${ctx.chat.type} chat`)
        .catch((e) => console.log(e))
    } else {
      return
    }
  }

  let urls = Array<string | undefined>()

  if (message?.caption_entities) {
    urls = message.caption_entities
      .filter((entity) => entity.type == 'url')
      .map((entity) => message?.text?.substr(entity.offset, entity.length))
  }
  if (message?.entities) {
    urls = urls.concat(
      message.entities
        .filter((entity) => entity.type == 'url')
        .map((entity) => message?.text?.substr(entity.offset, entity.length))
    )
  }

  //filter out undefned values
  let urls2: Array<string> = urls.filter((url) => url != undefined) as string[]

  //filter out non-youtube urls
  urls2 = urls2.filter(
    (url) => url.includes('youtube.com') || url.includes('youtu.be')
  )

  //filter out duplicates
  urls2 = [...new Set(urls2)]

  if (!fs.existsSync(`${usr_data}`)) {
    fs.mkdirSync(`${usr_data}`)
  }

  let usr_dir = `${usr_data}/${ctx.from?.id}/`
  let msg_id = crypto.randomBytes(16).toString('hex')
  let message_dir = `${usr_dir}${msg_id}/`

  if (!fs.existsSync(`${usr_dir}`)) {
    fs.mkdirSync(`${usr_dir}`)
  }

  if (urls2.length > 0 && !fs.existsSync(message_dir)) {
    fs.mkdirSync(message_dir)
  }

  let languageTags = ['en-GB', 'en-US', 'en']

  for (let i = 0; i < urls2.length; ++i) {
    try {
      ctx.replyWithChatAction('typing').catch((e) => console.log(e))
      let goodTag = ''
      let id = urls2[i]
      let file_path = `${message_dir}/${i}`
      console.log('Downloading...')

      let rs = await youtubedl(id, {
        listSubs: true,
        skipDownload: true,
        o: file_path,
      })

      let availableLang = rs.split('Language formats')[1]
      if (
        availableLang != undefined &&
        !availableLang.includes('has no subtitles')
      ) {
        for (let tag of languageTags) {
          if (availableLang.includes(tag)) {
            goodTag = tag
            break
          }
        }
      }

      if (goodTag != '') {
        await youtubedl(id, {
          writeSub: true,
          subLang: goodTag,
          skipDownload: true,
          subFormat: 'ttml',
          o: file_path,
        })
      }

      let downloadedFile = `${file_path}.${goodTag}.ttml`
      if (fs.existsSync(downloadedFile)) {
        console.log('Finished downloading...')
        ctx.replyWithChatAction('typing').catch((e) => console.log(e))
        await processCaptions(ctx, downloadedFile, id)
      } else {
        console.log('Trying autogenerated captions...')
        await youtubedl(id, {
          writeAutoSub: true,
          subLang: 'en',
          skipDownload: true,
          subFormat: 'ttml',
          o: file_path,
        })
        if (fs.existsSync(`${file_path}.en.ttml`)) {
          console.log('Finished downloading...')
          ctx.replyWithChatAction('typing').catch((e) => console.log(e))
          await processCaptions(ctx, `${file_path}.en.ttml`, id)
        } else {
          console.log('No luck...')
        }
      }
    } catch (e) {
      console.log(e)
    }
  }

  if (fs.existsSync(message_dir)) {
    fs.rmSync(message_dir, { force: true, recursive: true })
  }
}

async function processCaptions(
  ctx: Context,
  file_path: string,
  video_url: string
) {
  let caption: string = fs.readFileSync(file_path, 'utf8').toString()
  caption = caption.replace(/<[^>]*>?/gm, '')
  caption = he.decode(caption)
  caption = caption.replaceAll('\n', ' ')
  caption = caption.replaceAll(/  +/g, ' ')
  let err = ''

  console.log('Punctuating...')
  ctx.replyWithChatAction('typing').catch((e) => console.log(e))
  let result = await ndl('post', 'http://bark.phon.ioc.ee/punctuator', {
    text: caption,
  })

  if (
    result.body.toString().includes('<title>502 Proxy Error</title>') ||
    result.statusCode != 200
  ) {
    console.log('Error punctuation')
    ctx
      .reply(
        'Sorry, I have some errors with my punctuation service. Try later',
        { reply_to_message_id: ctx.message?.message_id }
      )
      .catch((e) => console.log(e))
    err = 'Error punctuation'
  }
  if (err == '') {
    if (result.body.split('.').length > 7) {
      console.log('Summarizing...')
      ctx.replyWithChatAction('typing').catch((e) => console.log(e))
      let summary = await ndl(
        'post',
        `https://api.smmry.com/&SM_API_KEY=${ctx.dbuser.smmry_api}&SM_WITH_BREAK`,
        { sm_api_input: result.body },
        { headers: { Expect: '' }, follow_max: 5 }
      )

      //check if errors from summary
      if (summary.body['sm_api_message'] != 'INVALID API KEY') {
        let final_response = summary.body['sm_api_content']
          .replaceAll('[BREAK] ', '\n')
          .replaceAll('[BREAK]', '\n')
        let limit = summary.body['sm_api_limitation']
          ?.split('mode, ')[1]
          ?.split(' requests')[0]
        if (limit != undefined) {
          ctx.dbuser.smmry_limit = limit
          await ctx.dbuser.save()
        }
        ctx
          .reply(
            `Summary for ${video_url}\n\n${final_response}\n\nPowered by @videotldrbot`,
            { reply_to_message_id: ctx.message?.message_id }
          )
          .catch((e) => console.log(e))
      } else {
        ctx.dbuser.smmry_api = ''
        ctx.dbuser.smmry_limit = ''
        await ctx.dbuser.save()
        ctx
          .reply('Your smmry api key is invalid. Please, set a new one.')
          .catch((e) => console.log(e))
      }
    } else {
      ctx
        .reply(
          `Summary for ${video_url}\n\n${result.body}\n\nPowered by @videotldrbot`,
          { reply_to_message_id: ctx.message?.message_id }
        )
        .catch((e) => console.log(e))
    }
  } else {
    console.log(`Punctuating body: ${result.body}`)
  }
  fs.unlinkSync(file_path)
}

export async function setApi(ctx: Context) {
  let api = ctx.message?.text?.split('/summaryapi ')[1]
  if (api != undefined) {
    if (api.length < 50) {
      ctx.dbuser.smmry_api = api
      await ctx.dbuser.save()
      if (ctx.chat && ctx.message) {
        ctx.api
          .deleteMessage(ctx.chat?.id, ctx.message?.message_id)
          .catch((e) => console.log(e))
      }
      ctx.reply('API key set!').catch((e) => console.log(e))
    } else {
      ctx
        .reply('API key too long! Maybe it is wrong')
        .catch((e) => console.log(e))
    }
  } else {
    ctx.reply('No API key provided!').catch((e) => console.log(e))
  }
}

export async function getLimit(ctx: Context) {
  if (ctx.dbuser.smmry_api != '' && ctx.dbuser.smmry_limit != '') {
    ctx
      .reply(`Your limit is ${ctx.dbuser.smmry_limit}`)
      .catch((e) => console.log(e))
  } else {
    ctx
      .reply('You have no key set or limit is not set yet')
      .catch((e) => console.log(e))
  }
}

export async function countChats(ctx: Context) {
  if (ctx?.message?.from?.id == 180001222) {
    let chats = await countUsers()
    ctx.reply(`User number is ${chats}`).catch((e) => console.log(e))
  }
}
