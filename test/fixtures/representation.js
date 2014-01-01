exports.parse = function parse(source) {
  var lines = source.split(/\r\n|\r|\n/g);
  var result = [];
  var block = null;

  lines.forEach(function(line) {
    var match;

    // Block
    var re = /^\s*block\s+([\w\d]+)(?:\s+->\s+([\w\d]+)(?:\s*,\s*([\w\d]+))?)?/;
    match = line.match(re);
    if (match !== null) {
      if (block !== null)
        result.push(block);

      block = { id: match[1], instructions: [], successors: [] };
      if (match[2])
        block.successors.push(match[2]);
      if (match[3])
        block.successors.push(match[3]);
      return;
    }

    // Instruction
    match = line.match(/^\s*(?:([\w\d]+)\s*=\s*)?([\w\d]+)(?:\s+(.+))?\s*$/);
    if (match === null)
      return;

    var instr = {
      id: match[1] || null,
      type: match[2],
      inputs: match[3] && match[3].split(/\s*,\s*/g).map(function(input) {
        if (/^%/.test(input))
          return { type: 'js', value: JSON.parse(input.slice(1)) };
        else
          return { type: 'instruction', id: input };
      }) || null
    };
    block.instructions.push(instr);
  });

  if (block !== null)
    result.push(block);

  return result;
};

exports.stringify = function stringify(blocks) {
  function valueToStr(value) {
    if (value.type === 'js')
      return '%' + JSON.stringify(value.value);
    else if (value.type === 'register')
      return '$' + value.id;
    else
      return '[' + value.id + ']';
  }

  var res = '';
  blocks.forEach(function(block) {
    res += 'block ' + block.id;
    if (block.successors.length > 0)
      res += ' -> ' + block.successors.join(', ');
    res += '\n';

    block.instructions.forEach(function(instr) {
      res += '  ';
      if (instr.output)
        res += valueToStr(instr.output) + ' = ';
      res += instr.type;
        if (instr.inputs && instr.inputs.length > 0) {
          res += ' ' + instr.inputs.map(valueToStr).join(', ');
        }
      if (instr.moves && instr.moves.length) {
        res += ' {';
        res += instr.moves.map(function(move) {
          var from = valueToStr(move.from);
          var to = valueToStr(move.to);
          if (move.type === 'move')
            return from + ' => ' + to;
          else
            return from + ' <=> ' + to;
        }).join(', ');
        res += '}';
      }
      res += '\n';
    });
  });
  return res;
};
