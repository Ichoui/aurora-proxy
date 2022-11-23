import {dataTreatment, remoteUrlFactory} from "./aurora/data-aurora.mjs";
import {getClientAddress, publicIP, sendInvalidURLResponse, sendTooBigResponse, writeResponse} from "./aurora/utils.mjs";
import http from "http";
import https from "https";
import url from "url";
import cluster from "cluster";
import tokenthrottle from "tokenthrottle";
import axios from "axios";
import cors from "cors";
import express from "express";
import {
    auroraRegex,
    blacklistHostnameRegex,
    clusterProcessCount,
    enableLogging,
    enableRateLimiting,
    maxRequestLength,
    maxRequestsPerSecond,
    port,
    proxyRequestTimeoutSs
} from "./aurora/config.mjs";
import bodyParser from "body-parser";

const throttle = tokenthrottle({rate: maxRequestsPerSecond});
const app = express()

http.globalAgent.maxSockets = Infinity;
https.globalAgent.maxSockets = Infinity;

function processRequest(req, res) {
    // addCORSHeaders(req, res);
    const isAuroraApp = !!req.headers['aurora']
    // Return options pre-flight requests right away
    if (req.method.toUpperCase() === "OPTIONS") {
        return writeResponse(res, 204);
    }
    const result = auroraRegex.exec(req.url);

    // We don't support app which are not Aurora
    if (result && result.length === 2 && result[1] && isAuroraApp) {
        const remoteURL = remoteUrlFactory(req.url, res, result[1])
        const isRelativeUrl = !remoteURL.host;

        // We don't support relative links
        // if (isRelativeUrl) {
        //     return writeResponse(res, 404, "No relative URL");
        // }
        // We only support http and https and relativeUrl from auroraApp
        // if (remoteURL.protocol !== "http:" && remoteURL.protocol !== "https:" && (isRelativeUrl && !isAuroraApp)) {
        //     return writeResponse(res, 400, "Https or Http Protocols only");
        // }

        // Naughty, naughty— deny requests to blacklisted hosts
        if (blacklistHostnameRegex.test(remoteURL.hostname)) {
            return writeResponse(res, 400, "Nope !");
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
                    headers: req.headers, method: req.method, timeout: proxyRequestTimeoutSs
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
        // If relative url (not proxy to a swpc url), we only send back data
        if (isRelativeUrl) {
            res.status(200).send(dataTreatment(req.url, null, req.body));
            return;
        }

        getData(getUrl(remoteURL)).then(data => {
            let requestSize = 0;
            requestSize += data?.length;
            // Filter on ovation aurara latest to let it pass because lot of values inside (more than 150k / each request)
            if (requestSize >= maxRequestLength && !req.url.includes('/ovation_aurora_latest')) {
                res.end();
                return sendTooBigResponse(res);
            }

            res.status(200).send(dataTreatment(req.url, data));
        })
    } else {
        return sendInvalidURLResponse(res);
    }
}


if (cluster.isMaster) {
    for (let i = 0; i < clusterProcessCount; i++) {
        cluster.fork();
    }
} else {
    // Adding middleware usage for express app
    app.use(bodyParser.urlencoded({extended: true}), bodyParser.json(), cors())
    app.use((req, res, next) => {
        // Process AWS health checks
        if (req.url === "/quichaud") {
            return writeResponse(res, 200);
        }

        const clientIP = getClientAddress(req);
        req.clientIP = clientIP;

        // Log our request
        if (enableLogging) {
            console.log("%s %s %s", (new Date()).toJSON(), clientIP, req.method, req.url);
        }

        if (enableRateLimiting) {
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
    app.listen(port, hostname, function () {
        if (hostname === 'localhost') {
            console.warn("Server works on http://" + hostname + ":" + port);
        } else {
            console.warn("Server works on https://" + hostname);
        }
        console.warn("URL_HOST_TO_FOUND process started (PID " + process.pid + ")");
    });
}

