const http = require('http');
const https = require('https');
const config = require("./config");
const url = require("url");
const cluster = require('cluster');
const throttle = require("tokenthrottle")({rate: config.max_requests_per_second});

const express = require('express')
const app = express()
const axios = require('axios');

http.globalAgent.maxSockets = Infinity;
https.globalAgent.maxSockets = Infinity;

const publicAddressFinder = require("public-address");
let publicIP;

// Get our public IP address
publicAddressFinder(function (err, data) {
    if (!err && data) {
        publicIP = data.address;
    }
});

function addCORSHeaders(req, res) {
    if (req.method.toUpperCase() === "OPTIONS") {
        if (req.headers["access-control-request-headers"]) {
            res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
        }

        if (req.headers["access-control-request-method"]) {
            res.setHeader("Access-Control-Allow-Methods", req.headers["access-control-request-method"]);
        }
    }

    if (req.headers["origin"]) {
        res.setHeader("Access-Control-Allow-Origin", req.headers["origin"]);
    } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
}

function writeResponse(res, httpCode, body) {
    res.statusCode = httpCode;
    res.end(body);
}

function sendInvalidURLResponse(res) {
    return writeResponse(res, 404, "Url must be [HOST]/aurora/{url}");
}

function sendTooBigResponse(res) {
    return writeResponse(res, 413, "Max characters allow in the request / response : " + config.max_request_length);
}

function getClientAddress(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0]
        || req.connection.remoteAddress;
}

function urlRouterFactory(urlRequested, res, finalUrl) {
    try {
        if (urlRequested === '/aurora/map/ovation') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'));
        } else if (urlRequested === '/aurora/kp/current') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/json/boulder_k_index_1m.json'));
        } else {
            // URL is set in front app and does not need to be  reworked
            return url.parse(decodeURI(finalUrl));
        }
    } catch (e) {
        return sendInvalidURLResponse(res);
    }
}

function processRequest(req, res) {
    addCORSHeaders(req, res);

    // Return options pre-flight requests right away
    if (req.method.toUpperCase() === "OPTIONS") {
        return writeResponse(res, 204);
    }
    const result = config.aurora_regex.exec(req.url);
    if (result && result.length === 2 && result[1]) {
        const remoteURL = urlRouterFactory(req.url, res, result[1])

        // We don't support relative links
        if (!remoteURL.host) {
            return writeResponse(res, 404, "No relative URL");
        }

        // Naughty, naughty— deny requests to blacklisted hosts
        if (config.blacklist_hostname_regex.test(remoteURL.hostname)) {
            return writeResponse(res, 400, "Nope !");
        }

        // We only support http and https
        if (remoteURL.protocol !== "http:" && remoteURL.protocol !== "https:") {
            return writeResponse(res, 400, "Https or Http Protocols only");
        }

        if (publicIP) {
            // Add an X-Forwarded-For header
            if (req.headers["x-forwarded-for"]) {
                req.headers["x-forwarded-for"] += ", " + publicIP;
            } else {
                req.headers["x-forwarded-for"] = req.clientIP + ", " + publicIP;
            }
        }

        // Make sure the host header is to the URL we're requesting, not auroraProxy
        if (req.headers["host"]) {
            req.headers["host"] = remoteURL.host;
        }

        // Remove origin and referer headers. TODO: This is a bit naughty, we should remove at some point.
        delete req.headers["origin"];
        delete req.headers["referer"];

        const getUrl = (u) => (url.format(u));
        const getData = async (url) => {
            try {
                const response = await axios.get(url, {
                    headers: req.headers, method: req.method, timeout: config.proxy_request_timeout_ms
                })
                return response.data
            } catch (err) {
                if (err.code === "ENOTFOUND") {
                    return writeResponse(res, 502, "Host for " + getUrl(remoteURL) + " cannot be found.")
                } else {
                    console.error("Proxy Request Error (" + getUrl(remoteURL) + "): " + err.toString());
                    return writeResponse(res, 500, "Request error");
                }
            }
        }


        getData(getUrl(remoteURL)).then(data => {
            let requestSize = 0;
            requestSize += data?.length;
            // Filter on ovation aurara latest to let it pass because lot of values inside (more than 150k / each request)
            if (requestSize >= config.max_request_length && !req.url.includes('/ovation_aurora_latest')) {
                console.log('ef');
                res.end();
                return sendTooBigResponse(res);
            }

            res.send(dataTreatment(data, req.url))
        })

    } else {
        return sendInvalidURLResponse(res);
    }
}

function dataTreatment(data, urlRequested) {
    if (urlRequested === '/aurora/map/ovation') {
        console.log(data);
        return data;
    } else if (urlRequested === '/aurora/kp/current') {
        return data[data.length - 1]
    } else {
        return data;
    }
}

if (cluster.isMaster) {
    for (let i = 0; i < config.cluster_process_count; i++) {
        cluster.fork();
    }
} else {
    // app.use(bodyParser.json());
    app.use((req, res, next) => {
        // Process AWS health checks
        if (req.url === "/quichaud") {
            return writeResponse(res, 200);
        }

        const clientIP = getClientAddress(req);
        req.clientIP = clientIP;

        // Log our request
        if (config.enable_logging) {
            console.log("%s %s %s", (new Date()).toJSON(), clientIP, req.method, req.url);
        }

        if (config.enable_rate_limiting) {
            // Normal way with max 15 request/sec
            throttle.rateLimit(clientIP, function (err, limited) {
                if (limited) {
                    return writeResponse(res, 429, "Too much request");
                }

                processRequest(req, res);
            })
        } else {
            processRequest(req, res);
        }
    })

    const hostname = 'localhost';
    app.listen(config.port, hostname, function () {
        if (hostname === 'localhost') {
            console.warn("Server works on http://" + hostname + ":" + config.port);
        } else {
            console.warn("Server works on https://" + hostname);
        }
        console.warn("URL_HOST_TO_FOUND process started (PID " + process.pid + ")");
    });
}
