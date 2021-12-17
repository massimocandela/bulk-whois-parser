import Connector from "./connector";
import ConnectorAPNICrir from "./connectorLACNICrir";
import ConnectorAPNICrr from "./connectorLACNICrr";
import batchPromises from "batch-promises";

export default class ConnectorLACNIC extends Connector {
    constructor(params) {
        super(params)

        this.rir = new ConnectorAPNICrir(params);
        this.rr = new ConnectorAPNICrr(params);
    }


    _getCorrectConnector = (type, filterFunction, fields, forEachFunction) => {
        if (["route", "route6", "as-set", "aut-num", "mntner", "person"].includes(type)) {
            return this.rr.getObjects([type], filterFunction, fields, forEachFunction);
        } else {
            return this.rir.getObjects([type], filterFunction, fields, forEachFunction);
        }
    };


    getObjects = (types, filterFunction, fields, forEachFunction) => {
        fields = fields || [];

        return batchPromises(1, types, type => {
            return this._getCorrectConnector(type, filterFunction, fields, forEachFunction)
        })
            .then(objects => [].concat.apply([], objects));
    }

}
