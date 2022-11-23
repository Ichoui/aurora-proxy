import url from "url";
import {sendInvalidURLResponse, writeResponse} from "./utils.mjs";
import NodeCache from "node-cache"
import {cachedTimeMapOvation} from "./config.mjs";

const cache = new NodeCache({checkperiod: 600});

/**
 * @param urlRequested url requested from front, without the host part
 * @param res res value from the request triptych (req, res, next)
 * @param finalUrl URL set in client side  app and does not need to be  reworked
 */
export function remoteUrlFactory(urlRequested, res, finalUrl) {
    try {
        if (urlRequested === '/aurora/map/ovation') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'));
        } else if (urlRequested === '/aurora/forecast/solarcycle') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json'));
        } else if (urlRequested === '/aurora/instant/kp') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/json/boulder_k_index_1m.json'));
        } else if (urlRequested === '/aurora/instant/solarwind') {
            return url.parse(decodeURI('https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'));
        } else {
            return url.parse(decodeURI(finalUrl));
        }
    } catch (e) {
        return sendInvalidURLResponse(res);
    }
}


/**
 * @param urlRequested url requested from front, without the host part
 * @param data any data from API ; nullable
 * @param body body from POST method
 */
export function dataTreatment(urlRequested, data, body) {
    switch (urlRequested) {
        case '/aurora/map/ovation':
            const ovationMapCached = cache.get('ovationMapCache')
            console.log(ovationMapCached);
            if (ovationMapCached) {
                return ovationMapCached
            }
            const mappedCoords = [];
            // TOdo PERFORMANCE OPTIMISER FOREACH A VERIFIER
            data['coordinates'].forEach((coords /*[long, lat, aurora]*/) => {
                let long = coords[0];
                const lat = coords[1];
                const nowcastAurora = coords[2];
                if (long > 180) {
                    // Longitude 180+ dépasse de la map à droite, cela permet de revenir tout à gauche de la carte
                    long = long - 360;
                }
                // On prend les valeurs paires seulement, et on leur rajoute +2 pour compenser les "trous" causés par l'impair
                // On passe ainsi d'environ 7500 à 1900 valeurs dans le tableau (indication de taille récupérée)
                if (lat >= 30 || lat <= -30) {
                    if (nowcastAurora >= 2 && long % 2 === 0 && lat % 2 === 0) {
                        // coords avec long soustrait pour couvrir -180 à 180 de longitude
                        mappedCoords.push([long, lat, nowcastAurora])
                    }
                }
            })
            cache.set("ovationMapCache", mappedCoords, cachedTimeMapOvation)
            cache.set("ovationFullForNowcast", data['coordinates'], cachedTimeMapOvation)
            return mappedCoords;
        case '/aurora/forecast/solarcycle':
            // PERFORMANCE MAP
            return data.map(e => ({
                timeTag: e['time-tag'],
                predictedSsn: e['predicted_ssn'],
                predictedSolarFlux: e['predicted_f10.7']
            }))
        case '/aurora/instant/nowcast':
            return {nowcast: getNowcastAurora(body['lng'], body['lat'])}
        case '/aurora/forecast/solarwind':
            // const finalData = []
            // const d = data.map((e, i) => {
            //     if (i === 0) {
            //         finalData.push(e)
            //     } else {
            //         finalData.push(e)
            //     }
            // })
            return data;
        case '/aurora/instant/kp':
            return data[data.length - 1]
        default:
            return data;
    }
}


function getNowcastAurora(long, lat) {
    try {
        const ovationMapCache = cache.get('ovationFullForNowcast');
        if (!ovationMapCache) {
            return null;
        }
        /*[long, lat, aurora]*/
        // Todo OTPIMISER
        for (let coords of ovationMapCache) {
            if (coords[0] === Math.round(long) && coords[1] === Math.round(lat)) {
                return coords[2]
            }
        }
    } catch (e) {
        writeResponse(e, 404, 'Cache nowcast error')
    }
}
