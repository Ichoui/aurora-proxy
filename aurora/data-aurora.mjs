import url from "url";
import {sendInvalidURLResponse} from "./utils.mjs";
// import {MemoryCache} from 'memory-cache-node';
//
// const itemsExpirationCheckIntervalInSecs = 10 * 60;
// const maxItemCount = 1000000;
// const memoryCache = new MemoryCache(itemsExpirationCheckIntervalInSecs, maxItemCount);

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
            // URL is set in front app and does not need to be  reworked
            return url.parse(decodeURI(finalUrl));
        }
    } catch (e) {
        return sendInvalidURLResponse(res);
    }
}


export function dataTreatment(data, urlRequested) {
    switch (urlRequested) {
        case '/aurora/map/ovation':
            // console.log(data);
            const mappedCoords = [];
            // PERFORMANCE FOREACH A VERIFIER
            // LONG A RECALCULER ET A PASSER A 180
            data['coordinates'].forEach((coords /*[long, lat, aurora]*/) => {
                let long = coords[0];
                const lat = coords[1];
                const nowcastAurora = coords[2];
                if (long > 180) {
                    // Longitude 180+ dépasse de la map à droite, cela permet de revenir tout à gauche de la carte
                    long = long - 360;
                }

                // On prend les valeurs paires seulement, et on leur rajoute +2 pour compenser les "trous" causés par l'impair
                // On passe ainsi d'environ 7500 à 1900 layers supplémentaire
                if (lat >= 30 || lat <= -30) {
                    if (nowcastAurora >= 2 && long % 2 === 0 && lat % 2 === 0) {
                        mappedCoords.push(coords)
                    }
                }
            })
            console.log(mappedCoords);

            return mappedCoords;
        case '/aurora/forecast/solarcycle':
            // PERFORMANCE MAP
            return data.map(e => ({
                timeTag: e['time-tag'],
                predictedSsn: e['predicted_ssn'],
                predictedSolarFlux: e['predicted_f10.7']
            }))
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

