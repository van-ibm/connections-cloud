describe("connections-cloud", function() {
  require('dotenv').config()

  var connections = require('../ConnectionsCloud'),
      async = require('async'),
      log = require('loglevel');

  log.setLevel('info');

  var data = {
    communities : [
      {
        dc : 'apps.na.collabserv.com',
        id : '63df90b3-0567-4efb-b9ad-8b4f12b7c8c2',
        user : {
          id : '21188',
          username : process.env.PRIVATE_USER,
          password : process.env.APP_PASSWORD,
          isAppPassword: true
        }
      },
      {
        dc : 'apps.na.collabserv.com',
        id : 'af686e84-9e38-4101-8026-07c6c92cea2c',
        user : {
          id : '21188',
          username : process.env.PRIVATE_USER,
          password : process.env.APP_PASSWORD,
          isAppPassword: true
        }
      },
      {
        dc : 'apps.na.collabserv.com',
        id : 'b6359918-f37b-4241-aeec-c86b79cf9966',
        user : {
          id : '22980937',
          username : process.env.SHARED_USER,
          password : process.env.SHARED_PASSWORD,
          isAppPassword: false
        }
      }
    ]
  };

  it('login', function(done) {
    async.each(data.communities,
      (community, callback) => {
        var client = new connections(community.dc, community.user.username,
          community.user.password, community.user.isAppPassword);

        client.login((err) => {
          expect(err).toBeNull();

          // add the connections-cloud client to the test data for later use
          community.client = client;

          // tell async that this is completed
          callback();
        });
      },
      (err) => {
        // tell jasmine everything is completed
        done();
      });
    });

  // list the apps added into a community
  it('communityApps', function(done) {
    log.info('communityApps');

    async.each(data.communities,
      (community, callback) => {
        community.client.communityApps(community.id,
          (err, json) => {
            expect(err).toBeNull();

            if(!err) {
              log.debug(JSON.stringify(json, null, 2));

              // there are expected to be some apps
              expect(json.items.length).toBeGreaterThan(0);

              // depending on the app, save the ID for usage
              for(var i in json.items) {
                switch(json.items[i].content) {
                  case 'Blog':
                    community.blogId = community.id;
                  break;
                  case 'Wiki':
                    community.wikiId = json.items[i].id;
                  break;
                  case 'Forum':
                    community.forumId = community.id;
                  break;
                }
              }
            }
            callback();
          });
      },
      (err) => {
        done();
      });
  });

  it('profileTags', function(done) {
    log.info('profileTags');

    async.each(data.communities,
      (community, callback) => {
        community.client.profileTags(community.user.id,
    			(err, json) => {
            if(!err) {
              expect(json.items.length).toBeGreaterThan(0);

              log.info(`profile ${community.user.id} / tags ${json.items.length}`);
              log.debug(JSON.stringify(json, null, 2));
            }
            callback();
          });
      },
      (err) => {
        done();
      });
  });

  it('blogEntries', function(done) {
    log.info('blogEntries');

    async.each(data.communities,
      (community, callback) => {
        community.client.blogEntries(community.blogId,
    			(err, json) => {
            if(!err) {
              expect(json.items.length).toBeGreaterThan(0);

              log.info(`community ${community.id} / blog ${community.blogId} / ${json.items.length} entries`);
              log.debug(JSON.stringify(json, null, 2));
            }
            callback();
          });
      },
      (err) => {
        done();
      });
  });

  it('wikiPages', function(done) {
    log.info('wikiPages');

    async.each(data.communities,
      (community, callback) => {
        community.client.wikiPages(community.wikiId,
    			(err, json) => {
            if(!err) {
              expect(json.items.length).toBeGreaterThan(0);

              log.info(`community ${community.id} / wiki ${community.wikiId} / ${json.items.length} wiki pages`);

              for(var i in json.items) {
                expect(json.items[i].content).toMatch('');
              }
            }
            callback();
          }, true);
      },
      (err) => {
        done();
      });
  });

  it('forumTopics', function(done) {
    log.info('forumTopics');

    var options = {
      ps : '25'
    }

    async.each(data.communities,
      (community, callback) => {
        community.client.forumTopics(community.forumId,
    			(err, json) => {
            if(!err) {
              expect(json.items).toBeDefined();

              log.info(`community ${community.id} / forum ${community.forumId} / ${json.items.length} forum topics`);
              log.debug(JSON.stringify(json, null, 2));

              if(json.items.length > 0) {
                community.forumTopics = json.items;
              }
            }
            callback();
          }, options);
      },
      (err) => {
        done();
      });
  });

  it('forumTopic', function(done) {
    log.info('forumTopic');

    async.each(data.communities,
      (community, callback) => {
        if(community.forumTopics && community.forumTopics.length > 0) {
          community.client.forumTopic(community.forumTopics[0].id,
      			(err, json) => {
              if(!err) {
                expect(json.items).toBeDefined();

                log.info(`community ${community.id} / forum ${community.forumId} / topic ${community.forumTopics[0].id}`);
                log.debug(JSON.stringify(json, null, 2));

                callback();
              }
            });
        } else {
          callback();
        }
      },
      (err) => {
        done();
      });
  });

  it('forumTopicReplies', function(done) {
    log.info('forumTopicReplies');

    async.each(data.communities,
      (community, callback) => {
        if(community.forumTopics && community.forumTopics.length > 0) {
          community.client.forumTopic(community.forumTopics[0].id,
      			(err, json) => {
              if(!err) {
                expect(json.items).toBeDefined();

                log.info(`community ${community.id} / forum ${community.forumId} / topic ${community.forumTopics[0].id} / ${json.items.length} total`);
                log.debug(JSON.stringify(json, null, 2));

                callback();
              }
            }, true);
        } else {
          callback();
        }
      },
      (err) => {
        done();
      });
  });
});
