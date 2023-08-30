import ConnectorRIPE from "./connectors/connectorRIPE";
import ConnectorAFRINIC from "./connectors/connectorAFRINIC";
import ConnectorLACNIC from "./connectors/connectorLACNIC";
import ConnectorAPNIC from "./connectors/connectorAPNIC";
import ConnectorARIN from "./connectors/connectorARIN";

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
        return Promise
            .all(Object
                .keys(this.connectors)
                .map(key => this.connectors[key].getObjects(types, filterFunction, fields, forEachFunction))
            )
            .then(objects => objects.flat());
    };

    getObjects = (types, filterFunction, fields) => {
        return this._getObjects(types, filterFunction, fields, null);
    };

    forEachObject = (types, filterFunction, fields, forEachFunction) => {
        return this._getObjects(types, filterFunction, fields, forEachFunction)
            .then(() => null);
    };
}