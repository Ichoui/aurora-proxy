import {cpus} from "os";

export const port = process.env.PORT || 3945;
export const enable_logging = true;
export const aurora_regex = /^\/aurora\/(.*)$/; // The URL to look for when parsing the request.
export const proxy_request_timeout_ms = 10000; // The lenght of time we'll wait for a proxy server to respond before timing out.
export const max_request_length = 150000; // The maximum length of characters allowed for a request or a response.
export const enable_rate_limiting = true;
export const max_requests_per_second = 15; // The maximum number of requests per second to allow from a given IP.
export const blacklist_hostname_regex = /^(10\.|192\.|127\.|localhost$)/i; // Good for limiting access to internal IP addresses and hosts.
export const cluster_process_count = Number(process.env.CLUSTER_PROCESS_COUNT) || cpus().length;
