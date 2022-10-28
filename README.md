FORKED FROM thingproxy 
==========

A simple forward proxy server for processing API calls to servers that don't send CORS headers or support HTTPS.

### what?

auroraProxy allows javascript code on your site to access resources on other domains that would normally be blocked due to the [same-origin policy](http://en.wikipedia.org/wiki/Same_origin_policy). It acts as a proxy between your browser and a remote server and adds the proper CORS headers to the response.

In addition, some browsers don't allow requests for non-encrypted HTTP data if the page itself is loaded from HTTPS. auroraProxy also allows you to access non-secure HTTP API's from a secure HTTPS url. 

We encourage you to run your own auroraProxy server with this source code, but freeboard.io offers a free proxy available at:

http://URL_HOST_TO_FOUND and https://URL_HOST_TO_FOUND

### why?

Dashboards created with freeboard normally access APIs directly from ajax calls from javascript. Many API providers do not provide the proper CORS headers, or don't support HTTPS— auroraProxy is provided to overcome these limitations.

### how?

Just prefix any url with http(s)://URL_HOST_TO_FOUND/fetch/

For example:

```
https://URL_HOST_TO_FOUND/fetch/http://my.api.com/get/stuff
```

Any HTTP method, headers and body you send, will be sent to the URL you specify and the response will be sent back to you with the proper CORS headers attached.

### caveats

Don't abuse the URL_HOST_TO_FOUND server— it is meant for relatively small API calls and not as a proxy server to hide your identity. Right now we limit requests and responses to 100,000 characters each (sorry no file downloads), and throttle each IP to 10 requests/second.

### privacy

URL_HOST_TO_FOUND does log the date, requester's IP address, and URL for each request sent to it. We do not log headers or request bodies. We will not share or sell this data to anyone, period.
