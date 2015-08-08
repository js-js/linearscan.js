'use strict';

var fixtures = require('./fixtures');
var check = fixtures.checkBuilder;

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
      %0 [18;19)

      0. start (dead) [0;6)
      6. region (dead) [6;10)
      10. region (dead) [10;14)
      14. region (dead) [14;22)

      1. literal [1;17) : {1=*}, {17=*}
      3. if (dead) [3;4)

      7. literal [7;10) : {7=*}, {15=*}

      11. literal [11;14) : {11=*}, {15=*}

      14. ssa:phi [14;17) : {15=*}, {17=*}
      17. add [17;18) : {17=*}, {19=%0}
      19. return (dead) [19;20)
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
      %0 [20;21)

      0. start (dead) [0;6)
      6. region (dead) [6;12)
      12. region (dead) [12;20)
      20. region (dead) [20;24)

      1. literal [1;6) : {1=*}, {7=*}, {20=*}
      3. jump (dead) [3;4)

      6. ssa:phi [6;15) : {7=*}, {15=*}, {21=%0}
      9. if (dead) [9;10)

      13. literal [13;15) : {13=*}, {15=*}
      15. add [15;20) : {7=*}, {15=*}, {20=*}
      17. jump (dead) [17;18)

      21. return (dead) [21;22)
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
      %0 [8;9), [14;15)

      0. start (dead) [0;6)
      6. region (dead) [6;12)
      12. region (dead) [12;18)

      1. literal [1;6), [12;14) : {1=*}, {13=*}, {13=*}, {15=%0}
      3. jump (dead) [3;4)

      7. literal [7;8) : {7=*}, {9=%0}
      9. return (dead) [9;10)

      13. add [13;14) : {13=*}
      15. return (dead) [15;16)
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
      %0 [5;7)
      %1 [5;6)
      %2 [5;6)

      0. start (dead) [0;10)

      1. literal [1;5) : {1=*}, {5=%*}
      3. literal [3;5) : {3=*}, {5=*}
      5. call %0 (dead) [5;6) : {5=%0}, {7=%0}
      7. return (dead) [7;8)
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
      %0 [4;5)

      0. start (dead) [0;8)

      1. literal [1;4) : {1=*}, {3=*}, {3=*}, {5=%0}
      3. add [3;4) : {3=*}
      5. return (dead) [5;6)
    */});
  });
});
