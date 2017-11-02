'use strict'

const request = require('request')
const async = require('async')

// set up logging
const logger = require('winston')

class ConnectionsCloud {
  constructor (server, username, password, isAppPassword) {
    this.url = `https://${server}`

    // standard authentication information
    this.username = username
    this.password = password

    // formatter used to convert ATOM to ...
    this.formatter = require('cnx2js')

    this.isAppPassword = isAppPassword // special handling for app passwords

    // cookie jar uses specific jar for this client rather than global
    this.jar = request.jar()
  }

  login (callback) {
    // create login URL based on type of user account - either user or shared
    const path = this.isAppPassword ? '/eai/auth/basicMobile' : '/pkmslogin.form'

    // depending on the login method, headers or form data will be required
    const data = this.isAppPassword ?
    // user and app password requires "app id" header for successful login
    {
      'IBM-APP-ID': process.env.APP_ID  // this is an IBM whitelist; consult IBM for details
    } :
    // form data
    {
      'login-form-type': 'pwd',
      'error-code': '',
      'username': this.username,
      'password': this.password,
      'show_login': 'showLoginAgain'
    }

    const url = this.url + path

    logger.info(`Logging in to ${url}`)
    logger.info(`user ${this.username}`)
    logger.info(`using ${this.password.replace(/./g, '*')}`)

    if (this.isAppPassword) {
      request({
        uri: url,
        jar: this.jar,
        headers: data
      }, (err, res, content) => {
        this._loginDone(err, res, content, callback)
      }).auth(this.username, this.password, true)
    } else {
      request.post({
        uri: url,
        jar: this.jar
      }, (err, res, content) => {
        this._loginDone(err, res, content, callback)
      }).form(data)
    }
  }

  _loginDone (err, res, content, callback) {
        // 302 occurs on login to pkmslogin.form
    if (res.statusCode === 200 || res.statusCode === 302) {
      logger.info(`Successfully logged in ${this.username}`)
      logger.debug(`received ${this.jar.getCookies(this.url)} cookies`)

      setInterval(this.login, 1000 * 3600 * 12) // re-login in 12 hours

      callback(null)
    } else {
      logger.error(`Failed to login ${res.statusCode} ${res.statusMessage}`)
      callback(content)
    }
  }

  _execute (path, callback, raw) {
    logger.info(`executing ${this.url}${path}`)
    logger.debug(`sending ${this.jar.getCookies(this.url)} cookies`)

    request({
      uri: this.url + path,
      followRedirects: true,
      jar: this.jar
    }, (err, res, content) => {
      if (err) {
        logger.error(`${path} responded with ${err}`)
        // handle the error returned from the server
        return callback({
          items: [],
          code: err.statusCode,
          error: err
        })
      } else {
        logger.debug(`${path} responded with ${res.statusCode} ${res.statusMessage}`)
        logger.debug(`${path} responded with content body ${content}`)

        switch (res.statusCode) {
          case 401: // the user lacks access to the app
          case 404: // the app is likely not installed or user error
            return callback({
              items: [],
              code: res.statusCode,
              error: res.statusMessage
            })
          default:
            if (raw) {
              // don't format and return raw content
              callback(null, content)
            } else {
              this.formatter.format(content, 'items', callback)
            }
            break
        }
      }
    })
  }

  _createQuery (options) {
    let query = ''

    /*
     * do not omit the lang parameter or else you will get no response
     */

    if (options !== undefined) {
      if (options.lang === undefined) {
        options.lang = 'en_us'
      }

      for (let opt in options) {
        query = query + `${opt}=${options[opt]}&`
      }
    } else {
      query = 'lang=en_us'
    }

    return query
  }

  communityApps (handle, callback) {
    this._execute(`/communities/service/atom/community/remoteApplications?communityUuid=${handle}`, callback)
  }

  blogEntries (handle, callback, options) {
    this._execute(`/blogs/${handle}/feed/entries/atom?${this._createQuery(options)}`, callback)
  }

  blogComments (handle, callback, options) {
    this._execute(`/blogs/${handle}/feed/comments/atom?${this._createQuery(options)}`, callback)
  }

  blogEntry (handle, entry, callback, options) {
    this._execute(`/blogs/${handle}/api/entries/${entry}?${this._createQuery(options)}`, callback)
  }

  blogEntryComments (handle, entry, callback, options) {
    this._execute(`/blogs/${handle}/api/entrycomments/${entry}?${this._createQuery(options)}`, callback)
  }

  forumTopics (handle, callback, options) {
    this._execute(`/forums/atom/topics?forumUuid=${handle}&${this._createQuery(options)}`, callback)
  }

  forumTopic (handle, callback, includeReplies, options) {
    if (includeReplies) {
      this._execute(`/forums/atom/replies?topicUuid=${handle}&${this._createQuery(options)}`, callback)
    } else {
      this._execute(`/forums/atom/topic?topicUuid=${handle}&${this._createQuery(options)}`, callback)
    }
  }

  profileTags (userid, callback) {
    // first get the userid - usually in the form 20008888
    this._execute(`/profiles/atom/profile.do?userid=${userid}`,
      (err, json) => {
        if (!err) {
              // then use the actual GUID to make the request to the profile
          this._execute(`/profiles/atom/profileTags.do?targetKey=${json.items[0].id}`,
                  callback)
        } else {
          callback(err)
        }
      })
  }

  wikiPages (handle, callback, downloadContent, options) {
    this._execute(`/wikis/basic/api/wiki/${handle}/feed?${this._createQuery(options)}`, (err, json) => {
      if (!err) {
        if (downloadContent) {
                    // process every page and download
          async.each(json.items, (item, cb) => {
            this._wikiPageDownloader(handle, item, (err, html) => {
              if (!err) {
                item.content = html
              } else {
                logger.error(`Failed to get content for ${item.id}`)
              }
              cb(null, item) // tell the async library we're done
            })
          }, (err) => {
                        // all async ops are now done return the full json
            callback(null, json)
          })
        } else {
          // bypassing download of content
          // manually set the content to empty
          for (let i in json.items) {
            json.items[i].content = ''
          }
          callback(null, json)
        }
      } else {
        callback(err)
      }
    })
  }

  wikiPage (handle, page, callback, options) {
    this._execute(`/wikis/basic/api/wiki/${handle}/page/${page}/entry?${this._createQuery(options)}`, (err, json) => {
      // wiki pags don't include content in the ATOM feed - need to download,
      // <content type="text/html"
      // src="/wikis/basic/api/wiki/b3fc070c-ff0c-405d-9dd9-f2e545594c61/page/07553add-f34d-43a8-964e-2c31a90046ad/media?convertTo=html">
      // </content>
      if (!err) {
        this._wikiPageDownloader(handle, json.items[0], (err2, html) => {
                    // overwrite original "content" with downloaded html
          if (!err2) {
            json.items[0].content = html
            callback(null, json)
          } else {
            callback(err2)
          }
        })
      } else {
        callback(err)
      }
    })
  }

  _wikiPageDownloader (handle, item, callback) {
    // the behavior for Cloud is a 302 redirect to the actual download source
    // /wikis/basic/api/wiki/b3fc070c-ff0c-405d-9dd9-f2e545594c61
    // /page/901762cf-e9a7-43a6-91bd-4df0b297a088
    // /version/dc826979-b272-447d-9b3b-02bac2ca6069/media
    const url = `/wikis/basic/api/wiki/${handle}/page/${item.id}/version/${item.version}/media`

    logger.debug(`dowloading wiki html from ${url}`)

    this._execute(url, (err, html) => {
      if (!err) {
        logger.debug(`downloaded HTML of size ${html.length}`)
        callback(null, html)
      } else {
        callback(err)
      }
    }, true) // make sure to specify true to get the raw content
  }

  wikiPageComments (handle, page, callback, options) {
    this._execute(`/wikis/basic/api/wiki/${handle}/page/${page}/feed?${this._createQuery(options)}`, callback)
  }
}

module.exports = ConnectionsCloud
