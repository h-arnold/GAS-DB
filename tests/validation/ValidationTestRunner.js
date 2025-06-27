/**
 * ValidationTestRunner.js - Simple runner for validation tests
 * 
 * Provides easy-to-use functions for running validation tests from the Apps Script editor.
 * This file serves as the entry point for manual test execution.
 */

/**
 * Run all validation tests - main entry point
 * Call this function from the Apps Script editor to run all validation tests
 */
function runAllValidationTestsNow() {
  const logger = JDbLogger.createComponentLogger('ValidationRunner');
  
  try {
    logger.info('=== Starting Validation Test Execution ===');
    const startTime = new Date();
    
    const results = runAllValidationTests();
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Print comprehensive results
    console.log('\n=== VALIDATION TEST RESULTS ===');
    console.log(`Total Test Suites: ${results.getTestSuiteCount()}`);
    console.log(`Total Tests: ${results.getTotalTestCount()}`);
    console.log(`Passed: ${results.getPassedTestCount()}`);
    console.log(`Failed: ${results.getFailedTestCount()}`);
    console.log(`Execution Time: ${duration}ms`);
    console.log(`Success Rate: ${((results.getPassedTestCount() / results.getTotalTestCount()) * 100).toFixed(1)}%`);
    
    if (results.hasFailures()) {
      console.log('\n=== FAILED TESTS ===');
      results.getFailedTests().forEach((result, index) => {
        console.log(`${index + 1}. ${result.suiteName} > ${result.testName}`);
        console.log(`   Error: ${result.error}`);
        if (result.details) {
          console.log(`   Details: ${result.details}`);
        }
      });
    } else {
      console.log('\n🎉 All validation tests passed!');
    }
    
    logger.info('Validation test execution completed', {
      totalTests: results.getTotalTestCount(),
      passed: results.getPassedTestCount(),
      failed: results.getFailedTestCount(),
      duration: duration
    });
    
    return results;
    
  } catch (error) {
    logger.error('Validation test execution failed', { error: error.message });
    console.error('❌ Validation test execution failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Run only comparison operator tests
 * Call this function to test just the $eq, $gt, $lt operators
 */
function runComparisonTests() {
  const logger = JDbLogger.createComponentLogger('ValidationRunner-Comparison');
  
  try {
    logger.info('=== Starting Comparison Operator Test Execution ===');
    const startTime = new Date();
    
    const results = runComparisonOperatorTests();
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.log('\n=== COMPARISON OPERATOR TEST RESULTS ===');
    console.log(`Total Tests: ${results.getTotalTestCount()}`);
    console.log(`Passed: ${results.getPassedTestCount()}`);
    console.log(`Failed: ${results.getFailedTestCount()}`);
    console.log(`Execution Time: ${duration}ms`);
    
    if (results.hasFailures()) {
      console.log('\n=== FAILED TESTS ===');
      results.getFailedTests().forEach((result, index) => {
        console.log(`${index + 1}. ${result.suiteName} > ${result.testName}`);
        console.log(`   Error: ${result.error}`);
      });
    } else {
      console.log('\n🎉 All comparison operator tests passed!');
    }
    
    return results;
    
  } catch (error) {
    logger.error('Comparison operator test execution failed', { error: error.message });
    console.error('❌ Comparison operator test execution failed:', error.message);
    throw error;
  }
}

/**
 * Run a specific test suite
 * @param {string} suiteName - Name of the test suite (e.g., '$eq Equality Operator Tests')
 */
function runSpecificTestSuite(suiteName) {
  const logger = JDbLogger.createComponentLogger('ValidationRunner-Suite');
  
  if (!suiteName) {
    console.log('Available test suites:');
    const tests = listValidationTests();
    Object.keys(tests).forEach(suite => {
      console.log(`- ${suite}`);
    });
    return;
  }
  
  try {
    logger.info(`Running test suite: ${suiteName}`);
    const startTime = new Date();
    
    const results = runValidationTestSuite(suiteName);
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.log(`\n=== ${suiteName.toUpperCase()} RESULTS ===`);
    console.log(`Total Tests: ${results.getTotalTestCount()}`);
    console.log(`Passed: ${results.getPassedTestCount()}`);
    console.log(`Failed: ${results.getFailedTestCount()}`);
    console.log(`Execution Time: ${duration}ms`);
    
    if (results.hasFailures()) {
      console.log('\n=== FAILED TESTS ===');
      results.getFailedTests().forEach((result, index) => {
        console.log(`${index + 1}. ${result.testName}`);
        console.log(`   Error: ${result.error}`);
      });
    }
    
    return results;
    
  } catch (error) {
    logger.error(`Test suite execution failed: ${suiteName}`, { error: error.message });
    console.error(`❌ Test suite execution failed: ${error.message}`);
    throw error;
  }
}

/**
 * List all available validation tests
 */
function listAvailableValidationTests() {
  try {
    console.log('\n=== AVAILABLE VALIDATION TESTS ===');
    const tests = listValidationTests();
    
    Object.keys(tests).forEach(suiteName => {
      console.log(`\n📁 ${suiteName}:`);
      tests[suiteName].forEach(testName => {
        console.log(`  ✓ ${testName}`);
      });
    });
    
    console.log(`\nTotal Test Suites: ${Object.keys(tests).length}`);
    console.log(`Total Tests: ${Object.values(tests).reduce((sum, testList) => sum + testList.length, 0)}`);
    
  } catch (error) {
    console.error('❌ Failed to list validation tests:', error.message);
    throw error;
  }
}

/**
 * Check validation test environment status
 */
function checkValidationTestStatus() {
  try {
    const status = getValidationTestStatus();
    
    console.log('\n=== VALIDATION TEST STATUS ===');
    console.log(`Framework Initialised: ${status.isInitialised ? '✅' : '❌'}`);
    console.log(`Framework Exists: ${status.frameworkExists ? '✅' : '❌'}`);
    console.log(`Registered Suites: ${status.suiteCount}`);
    
    if (status.registeredSuites.length > 0) {
      console.log('\nRegistered Test Suites:');
      status.registeredSuites.forEach(suite => {
        console.log(`  - ${suite}`);
      });
    }
    
    return status;
    
  } catch (error) {
    console.error('❌ Failed to check validation test status:', error.message);
    throw error;
  }
}

/**
 * Quick test functions for debugging individual operators
 */

function testEqualityOperator() {
  return runSpecificTestSuite('$eq Equality Operator Tests');
}

function testGreaterThanOperator() {
  return runSpecificTestSuite('$gt Greater Than Operator Tests');
}

function testLessThanOperator() {
  return runSpecificTestSuite('$lt Less Than Operator Tests');
}

// Help function
function showValidationTestHelp() {
  console.log('\n=== VALIDATION TEST RUNNER HELP ===');
  console.log('Available functions:');
  console.log('');
  console.log('🔹 runAllValidationTestsNow() - Run all validation tests');
  console.log('🔹 runComparisonTests() - Run comparison operator tests only');
  console.log('🔹 listAvailableValidationTests() - Show all available tests');
  console.log('🔹 checkValidationTestStatus() - Check test environment status');
  console.log('');
  console.log('🔸 testEqualityOperator() - Test $eq operator only');
  console.log('🔸 testGreaterThanOperator() - Test $gt operator only');
  console.log('🔸 testLessThanOperator() - Test $lt operator only');
  console.log('');
  console.log('🔸 runSpecificTestSuite(suiteName) - Run a specific test suite');
  console.log('');
  console.log('Examples:');
  console.log('  runSpecificTestSuite("$eq Equality Operator Tests")');
  console.log('  runAllValidationTestsNow()');
}

/* exported 
   runAllValidationTestsNow,
   runComparisonTests,
   runSpecificTestSuite,
   listAvailableValidationTests,
   checkValidationTestStatus,
   testEqualityOperator,
   testGreaterThanOperator,
   testLessThanOperator,
   showValidationTestHelp
*/
