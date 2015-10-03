'use strict';

var fixtures = require('./fixtures');
var check = fixtures.checkBuilder;

describe('Interval Builder', function() {
  it('should work on branch', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 3
          i1 = if ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = jump ^b1
        }
        b1 -> b3

        b2 {
          i4 = literal 2
          i5 = jump ^b2
        }
        b2 -> b3

        b3 {
          i6 = ssa:phi ^b3, i2, i4
          i7 = add i0, i6
          i8 = return ^b3, i7
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [26;27)

      0. start (dead) [0;7)
      7. region (dead) [7;14)
      14. region (dead) [14;21)
      21. region (dead) [21;30)

      2. literal [2;25) : {2=*}, {25=*}
      4. if (dead) [4;5)

      9. literal [9;14) : {9=*}, {23=*}
      11. jump (dead) [11;12)

      16. literal [16;21) : {16=*}, {23=*}
      18. jump (dead) [18;19)

      21. ssa:phi [21;25) : {23=*}, {25=*}
      25. add [25;26) : {25=*}, {27=%0}
      27. return (dead) [27;28)
    */});
  });

  it('should work on loops', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump ^b0
        }
        b0 -> b1

        b1 {
          i2 = ssa:phi ^b1, i0, i5
          i3 = if ^b1
        }
        b1 -> b2, b3

        b2 {
          i4 = literal 1
          i5 = add i2, i4
          i6 = jump ^b2
        }
        b2 -> b1

        b3 {
          i7 = return ^b3, i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [24;25)

      0. start (dead) [0;7)
      7. region (dead) [7;14)
      14. region (dead) [14;23)
      23. region (dead) [23;28)

      2. literal [2;7) : {2=*}, {9=*}, {23=*}
      4. jump (dead) [4;5)

      7. ssa:phi [7;18), [23;24) : {9=*}, {18=*}, {25=%0}
      11. if (dead) [11;12)

      16. literal [16;18) : {16=*}, {18=*}
      18. add [18;23) : {9=*}, {18=*}, {23=*}
      20. jump (dead) [20;21)

      25. return (dead) [25;26)
    */});
  });

  it('should generate holes', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 0
          i1 = jump ^b0
        }
        b0 -> b1, b2

        b1 {
          i2 = literal 1
          i3 = return ^b1, i2
        }

        b2 {
          i4 = add i0, i0
          i5 = return ^b2, i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [10;11), [17;18)

      0. start (dead) [0;7)
      7. region (dead) [7;14)
      14. region (dead) [14;21)

      2. literal [2;7), [14;17) : {2=*}, {16=*}, {18=%0}
      4. jump (dead) [4;5)

      9. literal [9;10) : {9=*}, {11=%0}
      11. return (dead) [11;12)

      16. add [16;17) : {16=*}
      18. return (dead) [18;19)
    */});
  });

  it('should process spills', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal "function-name"
          i1 = literal 0
          i2 = call i0, i1
          i3 = return ^b0, i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [6;8)
      %1 [6;7)
      %2 [6;7)
      %3 [6;7)

      0. start (dead) [0;11)

      2. literal [2;6) : {2=*}, {6=%*}
      4. literal [4;6) : {4=*}, {6=*}
      6. call %0 (dead) [6;7) : {6=%0}, {8=%0}
      8. return (dead) [8;9)
    */});
  });

  it('should produce correct single block intervals', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = add i0, i0
          i2 = return ^b0, i0
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [5;6)

      0. start (dead) [0;9)

      2. literal [2;5) : {2=*}, {4=*}, {6=%0}
      4. add [4;5) : {4=*}
      6. return (dead) [6;7)
    */});
  });

  it('should split on fixed output', function() {
    var b = fixtures.createBuilder(fixtures.options, function() {/*
      pipeline {
        b0 {
          i0 = literal "function-name"
          i1 = literal 0
          i2 = call i0, i1
          i3 = add ^b0, i2, i2
        }
      }
    */});

    b.buildIntervals();

    check(b, function() {/*
      %0 [6;7)
      %1 [6;7)
      %2 [6;7)
      %3 [6;7)

      0. start (dead) [0;11)

      2. literal [2;6) : {2=*}, {6=%*}
      4. literal [4;6) : {4=*}, {6=*}
      6. call %0 (dead) [6;7) : {8=*}, {6=%0}
      8. add [8;9) : {8=*}
    */});
  });
});
