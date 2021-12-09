const ndl = require('needle')
const error_txt: string = '<title>502 Proxy Error</title>'

export async function punctuate(content: string) {
  let result = await ndl('post', 'http://bark.phon.ioc.ee/punctuator', {
    text: content,
  })

  let punctuated = undefined
  let body_string: string = result.body.toString()
  if (!body_string.includes(error_txt) && result.statusCode == 200) {
    punctuated = body_string
  } else {
    console.log(`Punctuation error: ${body_string}`)
  }
  return punctuated
}
