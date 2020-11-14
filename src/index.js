import ConnectorRIPE from "./connectors/connectorRIPE";
import ConnectorAFRINIC from "./connectors/connectorAFRINIC";
import ConnectorLACNIC from "./connectors/connectorLACNIC";
import ConnectorAPNIC from "./connectors/connectorAPNIC";
import ConnectorARIN from "./connectors/connectorARIN";

export default class WhoisParser {
    constructor(params) {
        this.params = params || {};
        this.cacheDir = this.params.cacheDir || ".cache/";

        this.connectors = {};

        const connectors = {
            "ripe": ConnectorRIPE,
            "afrinic": ConnectorAFRINIC,
            "apnic": ConnectorAPNIC,
            "arin": ConnectorARIN,
            "lacnic": ConnectorLACNIC
        };

        if (this.params.repos) {
            for (let repo of this.params.repos) {
                this.connectors[repo] = new connectors[repo](this.params);
            }
        } else {
            for (let repo in connectors) {
                this.connectors[repo] = new connectors[repo](this.params);
            }
        }





    };

    getObjects = (types, filterFunction, fields) => {
        fields = fields || [];
        return Promise
            .all(Object
                .keys(this.connectors)
                .map(key => this.connectors[key].getObjects(types, filterFunction, fields))
            )
            .then(objects => [].concat.apply([], objects));
    };
}

// const filterFunction = (inetnum) => {
//
//     if (inetnum.remarks && inetnum.remarks.length > 0 ) {
//         return inetnum.remarks.some(i => i.startsWith("Geofeed"));
//     }
//
//     return false;
// }
//
// new WhoisParser({ repos: ["arin"] })
//     .getObjects(["inet6num"], filterFunction,  null)
//     .then(console.log);