import { jest, afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { page } from './config/setupTests.js'
import { ActionEnum, getTestFiles, wrapError } from '@dynamock/test-cases'
import { getPuppeteerTestCases } from './config/getTestCases.js'

describe('puppeteer integration tests', () => {
  const allTests = getTestFiles() //.filter(([filePath]) => filePath.includes('create-and-delete-bulk.yml'))

  beforeEach(() => page.goto('http://127.0.0.1:3000/index.html'))

  afterEach(() => {
    jest.resetModules()
  })

  test.each(allTests)('Test %s', async (absoluteFilePath) => {
    const { dynamock } = await import('../src/index.js')
    const testData = getPuppeteerTestCases(absoluteFilePath, 'http://127.0.0.1:3000')

    for (let i = 0; i < testData.length; i++) {
      const { action, expectation } = testData[i]
      // @ts-ignore
      // console.log(action.name, action.data, expectation)
      switch (action.name) {
        case ActionEnum.put_config:
        case ActionEnum.delete_config:
        case ActionEnum.post_fixture:
        case ActionEnum.post_fixtures_bulk:
        case ActionEnum.delete_fixture:
        case ActionEnum.delete_all_fixtures: {
          if (expectation.status === 400 || expectation.status === 409) {
            try {
              await dynamock(page, action.data)
            } catch (error: unknown) {
              if (error instanceof Error) {
                await wrapError(i, () => expect(error.message.substring(0, 21)).toBe('[FIXTURE SERVER ERROR'))
              } else {
                await wrapError(i, () => expect('error is not an instanceof Error').toBe(false))
              }
            }
          } else {
            await expect(dynamock(page, action.data)).resolves.toBe(undefined)
          }
          break
        }
        case ActionEnum.test_fixture: {
          const { path, method, body, bodyJSON, headers, cookies, query } = action.data
          const safeHeaders = headers ?? {}
          const safeQuery = query ?? {}

          if (cookies) {
            await page.setCookie(...Object.entries(cookies ?? {}).map(([name, value]) => ({ name, value })))
          }

          const fetchOptions: {
            method: string
            headers: { [key: string]: string }
            body: null | string
          } = {
            method: method,
            headers: safeHeaders,
            body: null,
          }

          if (bodyJSON !== undefined) {
            fetchOptions.body = JSON.stringify(bodyJSON)
            fetchOptions.headers = {
              ...fetchOptions.headers,
              'Content-Type': 'application/json',
            }
          } else if (body !== undefined) {
            fetchOptions.body = String(body)
          }

          const url = new URL(`http://127.0.0.1:3000${path}`)

          for (const queryKey in safeQuery) {
            url.searchParams.set(queryKey, safeQuery[queryKey])
          }

          const result = await page.evaluate(
            async (_url, _fetchOptions) => {
              const result = await fetch(_url, _fetchOptions)

              const bodyText = await result.text()

              let bodyJSON = undefined
              try {
                bodyJSON = JSON.parse(bodyText)
              } catch (error) {}

              return {
                status: result.status,
                headers: Object.fromEntries(result.headers.entries()),
                bodyText,
                bodyJSON,
              }
            },
            url.toString(),
            fetchOptions,
          )

          if (expectation.status) {
            await wrapError(i, () => expect(result.status).toBe(expectation.status))
          }

          if (expectation.headers) {
            // @ts-ignore
            await wrapError(i, () => expect(result.headers).toMatchObject(expectation.headers))
          }

          if (expectation.bodyJSON !== undefined) {
            await wrapError(i, async () => expect(result.bodyJSON).toEqual(expectation.bodyJSON))
          } else if (expectation.body !== undefined) {
            await wrapError(i, async () => expect(result.bodyText).toEqual(expectation.body))
          }
        }
      }
    }
  })

  // test('should', async () => {
  //   await dynamock(page, { cors: '*' }, [
  //     {
  //       request: {
  //         url: 'http://127.0.0.1:5000/pandas/1',
  //         method: 'POST',
  //       },
  //       response: {
  //         status: 201,
  //         headers: {
  //           'content-type': 'application/json',
  //         },
  //         body: {
  //           id: 1,
  //         },
  //       },
  //     },
  //   ])
  //
  //   const result = await page.evaluate(async () => {
  //     const result = await fetch('http://127.0.0.1:5000/pandas/1', {
  //       method: 'POST',
  //     })
  //
  //     return {
  //       status: result.status,
  //       body: await result.json(),
  //     }
  //   })
  //
  //   expect(result).toEqual({
  //     status: 201,
  //     body: {
  //       id: 1,
  //     },
  //   })
  // })
})
