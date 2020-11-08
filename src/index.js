import ConnectorRIPE from "./connectors/connectorRIPE";
import ConnectorAFRINIC from "./connectors/connectorAFRINIC";
import ConnectorLACNIC from "./connectors/connectorLACNIC";
import ConnectorAPNIC from "./connectors/connectorAPNIC";
import ConnectorARIN from "./connectors/connectorARIN";

export default class WhoisParser {
    constructor(params) {
        this.params = params || {};
        this.cacheDir = this.params.cacheDir || ".cache/";

        this.connectors = {
            "ripe": new ConnectorRIPE(this.params),
            "afrinic": new ConnectorAFRINIC(this.params),
            "apnic": new ConnectorAPNIC(this.params),
            "arin": new ConnectorARIN(this.params),
            "lacnic": new ConnectorLACNIC(this.params)
        };

    };

    getObjects = (types, filterFunction, fields) => {
        return Promise
            .all(Object
                .keys(this.connectors)
                .map(key => this.connectors[key].getObjects(types, filterFunction, fields))
            )
            .then(objects => [].concat.apply([], objects));
    };
}

const filterFunction = (inetnum) => {

    if (inetnum.remarks && inetnum.remarks.length > 0 ) {
        return inetnum.remarks.some(i => i.startsWith("Geofeed"));
    }

    return false;
}

new WhoisParser({})
    .getObjects(["inetnum", "inet6num"], filterFunction, null)
    .then(console.log);