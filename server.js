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
    aurora_regex,
    blacklist_hostname_regex,
    cluster_process_count,
    enable_logging,
    enable_rate_limiting,
    max_request_length,
    max_requests_per_second,
    port,
    proxy_request_timeout_ms
} from "./aurora/config.mjs";

const throttle = tokenthrottle({rate: max_requests_per_second});
const app = express()

http.globalAgent.maxSockets = Infinity;
https.globalAgent.maxSockets = Infinity;


function processRequest(req, res) {
    // addCORSHeaders(req, res);

    // Return options pre-flight requests right away
    if (req.method.toUpperCase() === "OPTIONS") {
        return writeResponse(res, 204);
    }
    const result = aurora_regex.exec(req.url);
    if (result && result.length === 2 && result[1]) {
        const remoteURL = remoteUrlFactory(req.url, res, result[1])

        // We don't support relative links
        if (!remoteURL.host) {
            return writeResponse(res, 404, "No relative URL");
        }

        // Naughty, naughty— deny requests to blacklisted hosts
        if (blacklist_hostname_regex.test(remoteURL.hostname)) {
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
                    headers: req.headers, method: req.method, timeout: proxy_request_timeout_ms
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
            if (requestSize >= max_request_length && !req.url.includes('/ovation_aurora_latest')) {
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


if (cluster.isMaster) {
    for (let i = 0; i < cluster_process_count; i++) {
        cluster.fork();
    }
} else {
    app.use(cors(), (req, res, next) => {
        // Process AWS health checks
        if (req.url === "/quichaud") {
            return writeResponse(res, 200);
        }

        const clientIP = getClientAddress(req);
        req.clientIP = clientIP;

        // Log our request
        if (enable_logging) {
            console.log("%s %s %s", (new Date()).toJSON(), clientIP, req.method, req.url);
        }

        if (enable_rate_limiting) {
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

