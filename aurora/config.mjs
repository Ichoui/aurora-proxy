import {cpus} from "os";

export const port = process.env.PORT || 3945;
export const enableLogging = true;
export const auroraRegex = /^\/aurora\/(.*)$/; // The URL to look for when parsing the request.
export const proxyRequestTimeoutSs = 10000; // The lenght of time we'll wait for a proxy server to respond before timing out.
export const maxRequestLength = 150000; // The maximum length of characters allowed for a request or a response.
export const enableRateLimiting = true;
export const maxRequestsPerSecond = 15; // The maximum number of requests per second to allow from a given IP.
export const blacklistHostnameRegex = /^(10\.|192\.|127\.|localhost$)/i; // Good for limiting access to internal IP addresses and hosts.
export const clusterProcessCount = Number(process.env.CLUSTER_PROCESS_COUNT) || cpus().length;
export const cachedTimeMapOvation = 30 * 60;
