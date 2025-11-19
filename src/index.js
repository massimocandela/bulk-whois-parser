import ConnectorRIPE from "./connectors/connectorRIPE";
import ConnectorAFRINIC from "./connectors/connectorAFRINIC";
import ConnectorLACNIC from "./connectors/connectorLACNIC";
import ConnectorAPNIC from "./connectors/connectorAPNIC";
import ConnectorARIN from "./connectors/connectorARIN";
import batchPromises from "batch-promises";

export default class WhoisParser {
    constructor(params) {
        this.params = params || {
            userAgent: "bulk-whois-parser"
        };
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

    _getObjects = (types, filterFunction, fields, forEachFunction) => {
        fields = fields || [];

        const objects = [];
        return batchPromises(3, Object.keys(this.connectors), connector => {
            return this.connectors[connector]
                .getObjects(types, filterFunction, fields, forEachFunction)
                .then(results => objects.concat(results.flat()))
                .catch(console.log);
        });
    };

    getObjects = (types, filterFunction, fields) => {
        return this._getObjects(types, filterFunction, fields, null);
    };

    forEachObject = (types, filterFunction, fields, forEachFunction) => {
        return this._getObjects(types, filterFunction, fields, forEachFunction)
            .then(() => null);
    };
}
