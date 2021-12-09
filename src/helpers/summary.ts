const ndl = require('needle')

export async function summarize(
  content: string,
  api_key: string,
  nr_sentences: number = 7
): Promise<Array<string | undefined>> {
  let summary = await ndl(
    'post',
    `https://api.smmry.com/&SM_API_KEY=${api_key}&SM_LENGTH=${nr_sentences}&SM_WITH_BREAK`,
    { sm_api_input: content },
    { headers: { Expect: '' }, follow_max: 5 }
  )

  let message = summary.body['sm_api_message']
  let summaised = undefined
  let limit = undefined

  if (message && message != 'INVALID API KEY') {
    summaised = summary.body['sm_api_content']
      .replaceAll('[BREAK] ', '\n')
      .replaceAll('[BREAK]', '\n')
    limit = summary.body['sm_api_limitation']
      ?.split('mode, ')[1]
      ?.split(' requests')[0]
  } else {
    console.log(message)
  }

  return [message, summaised, limit]
}
