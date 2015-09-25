'use strict';

function DynamicOperand(body) {
  this.body = body;
}
module.exports = DynamicOperand;

DynamicOperand.prototype.resolve = function resolve(config, node) {
  return config.createOperand(this.body(node));
};
