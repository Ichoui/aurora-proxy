import {maxRequestLength} from "./config.mjs";

import publicAddressFinder from "public-address";

export function addCORSHeaders(req, res) {
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

export function writeResponse(res, httpCode, body) {
    res.statusCode = httpCode;
    res.end(body);
}

export function sendInvalidURLResponse(res) {
    return writeResponse(res, 404, "Url must be [HOST]/aurora/{url}");
}

export function sendTooBigResponse(res) {
    return writeResponse(res, 413, "Max characters allowed in the request or response : " + maxRequestLength);
}

export function getClientAddress(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0]
        || req.connection.remoteAddress;
}

export let publicIP;

// Get our public IP address
publicAddressFinder(function (err, data) {
    if (!err && data) {
        publicIP = data.address;
    }
});
