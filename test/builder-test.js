'use strict';

var assertText = require('assert-text');
assertText.options.trim = true;

var fixtures = require('./fixtures');

function check(b, expected) {
  var out = '';

  function renderInterval(prefix, interval) {
    var out = prefix + ' ';

    if (!interval.alive)
      out += '(dead) ';

    var ranges = interval.ranges.map(function(range) {
      return range.inspect();
    }).join(', ');

    out += ranges;

    var uses = interval.uses.concat(interval.fixedUses).map(function(use) {
      return use.inspect();
    }).join(', ');

    if (uses)
      out += ' : ' + uses;

    return out;
  }

  for (var i = 0; i < b.config.registers.length; i++) {
    var reg = b.config.registers[i];
    if (reg.ranges.length === 0)
      continue;

    out += renderInterval('%' + i, reg) + '\n';
  }

  for (var i = 0; i < b.intervals.length; i++) {
    var interval = b.intervals[i];
    var prefix = interval.start() + '. ' + interval.node.opcode;
    out += renderInterval(prefix, interval) + '\n';
  }

  assertText.equal(out, fixtures.fn2str(expected));
}

describe('Interval Builder', function() {
  it('should work on branch', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = if
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
        }
        b1 -> b3

        b2 {
          i3 = literal 2
        }
        b2 -> b3

        b3 {
          i4 = ssa:phi i2, i3
          i5 = add i0, i4
          i6 = return i5
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [10;11)

      0. start (dead) [4;6)
      1. region (dead) [6;7)
      2. region (dead) [7;8)
      3. region (dead) [8;11)

      4. literal [4;9) : {4=*}, {9=*}
      5. if (dead) [5;6)

      6. literal [6;7) : {6=*}, {8=*}

      7. literal [7;8) : {7=*}, {8=*}

      8. ssa:phi [8;9) : {8=*}, {9=*}
      9. add [9;10) : {9=*}, {10=%0}
      10. return (dead) [10;11)
    */});
  });

  it('should work on loops', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1

        b1 {
          i2 = ssa:phi i0, i5
          i3 = if
        }
        b1 -> b2, b3

        b2 {
          i4 = literal 1
          i5 = add i2, i4
          i6 = jump
        }
        b2 -> b1

        b3 {
          i7 = return i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [11;12)

      0. start (dead) [4;6)
      1. region (dead) [6;8)
      2. region (dead) [8;11)
      3. region (dead) [11;12)

      4. literal [4;6) : {4=*}, {6=*}, {11=*}
      5. jump (dead) [5;6)

      6. ssa:phi [6;9) : {6=*}, {9=*}, {11=%0}
      7. if (dead) [7;8)

      8. literal [8;9) : {8=*}, {9=*}
      9. add [9;11) : {6=*}, {9=*}, {11=*}
      10. jump (dead) [10;11)

      11. return (dead) [11;12)
    */});
  });

  it('should generate holes', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = return i2
        }

        b2 {
          i4 = add i0, i0
          i5 = return i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [6;7), [8;9)

      0. start (dead) [3;5)
      1. region (dead) [5;7)
      2. region (dead) [7;9)

      3. literal [3;5), [7;8) : {3=*}, {7=*}, {7=*}, {8=%0}
      4. jump (dead) [4;5)

      5. literal [5;6) : {5=*}, {6=%0}
      6. return (dead) [6;7)

      7. add [7;8) : {7=*}
      8. return (dead) [8;9)
    */});
  });

  it('should process spills', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal "function-name"
          i1 = literal 0
          i2 = call i0, i1
          i3 = return i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [3;5)
      %1 [3;4)
      %2 [3;4)

      0. start (dead) [1;5)

      1. literal [1;3) : {1=*}, {3=%*}
      2. literal [2;3) : {2=*}, {3=*}
      3. call [3;4) : {3=%0}, {4=%0}
      4. return (dead) [4;5)
    */});
  });

  it('should produce correct single block intervals', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = add i0, i0
          i2 = return i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [3;4)
      0. start (dead) [1;4)
      1. literal [1;3) : {1=*}, {2=*}, {2=*}, {3=%0}
      2. add [2;3) : {2=*}
      3. return (dead) [3;4)
    */});
  });
});
