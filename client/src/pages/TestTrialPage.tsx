import React from 'react';
import { Button } from "@/components/ui/button";
import { useSubscription } from '@/context/SubscriptionContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '@/context/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle, Info, ClockIcon, CreditCard, SkullIcon, Crown } from "lucide-react";

export function TestTrialPage() {
  const { subscription, testTrialExpiration, refreshSubscription } = useSubscription();
  const { user } = useAuth();
  const [testResult, setTestResult] = React.useState<any>(null);
  const [isRunningTest, setIsRunningTest] = React.useState(false);
  const [shouldShowResult, setShouldShowResult] = React.useState(false);

  // Format the trial end date for display
  const formatDate = (dateValue: any): string => {
    try {
      if (!dateValue) return 'Not set';
      
      // Try to convert the date value to a JavaScript Date
      let date;
      
      if (typeof dateValue === 'object') {
        // Handle Firebase Timestamp format
        if (dateValue._seconds !== undefined) {
          date = new Date(dateValue._seconds * 1000);
        } else if (dateValue.seconds !== undefined) {
          date = new Date(dateValue.seconds * 1000);
        } else if (typeof dateValue.toDate === 'function') {
          date = dateValue.toDate();
        } else if (dateValue instanceof Date) {
          date = dateValue;
        } else {
          date = new Date(dateValue);
        }
      } else {
        date = new Date(dateValue);
      }
      
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Run the trial expiration test
  const runTest = async () => {
    setIsRunningTest(true);
    setShouldShowResult(false);
    setTestResult(null);
    
    try {
      const result = await testTrialExpiration();
      setTestResult(result);
      setShouldShowResult(true);
    } catch (error) {
      console.error('Error running test:', error);
      setTestResult({ success: false, error });
      setShouldShowResult(true);
    } finally {
      setIsRunningTest(false);
    }
  };

  // Refresh subscription data
  const handleRefresh = async () => {
    setIsRunningTest(true);
    await refreshSubscription();
    setIsRunningTest(false);
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Trial Expiration Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Subscription Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Current Subscription Status
            </CardTitle>
            <CardDescription>Your current subscription information</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm font-medium">User ID:</div>
              <div className="text-sm">{user?.id || 'Not logged in'}</div>
              
              <div className="text-sm font-medium">Pro Status:</div>
              <div className="text-sm flex items-center">
                {subscription.isPro 
                  ? <><CheckCircle className="h-4 w-4 text-green-500 mr-1" /> Pro</>
                  : <><SkullIcon className="h-4 w-4 text-red-500 mr-1" /> Free</>
                }
              </div>
              
              <div className="text-sm font-medium">Trial Active:</div>
              <div className="text-sm flex items-center">
                {subscription.trialActive 
                  ? <><CheckCircle className="h-4 w-4 text-green-500 mr-1" /> Active</>
                  : <><AlertTriangle className="h-4 w-4 text-amber-500 mr-1" /> Inactive</>
                }
              </div>
              
              <div className="text-sm font-medium">Trial End Date:</div>
              <div className="text-sm flex items-center">
                <ClockIcon className="h-4 w-4 mr-1" />
                {formatDate(subscription.trialEndDate)}
              </div>
              
              <div className="text-sm font-medium">Subscription Plan:</div>
              <div className="text-sm flex items-center">
                <Crown className="h-4 w-4 mr-1" />
                {subscription.subscriptionPlan || 'None'}
              </div>
              
              <div className="text-sm font-medium">Subscription Status:</div>
              <div className="text-sm">
                {subscription.subscriptionStatus || 'None'}
              </div>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button 
              variant="outline" 
              onClick={handleRefresh} 
              disabled={isRunningTest}
              className="w-full"
            >
              {isRunningTest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                'Refresh Subscription Data'
              )}
            </Button>
          </CardFooter>
        </Card>
        
        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Trial Expiration Test
            </CardTitle>
            <CardDescription>Test if trial expiration works correctly</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert variant="destructive" className="bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This test will set your trial end date to the past, which will cause your trial to expire.
                Only use this for testing purposes.
              </AlertDescription>
            </Alert>
            
            {shouldShowResult && testResult && (
              <Alert variant={testResult.success && testResult.results?.testStatus === 'SUCCESS' ? 'default' : 'destructive'} className={testResult.success && testResult.results?.testStatus === 'SUCCESS' ? 'bg-green-50' : 'bg-red-50'}>
                {testResult.success && testResult.results?.testStatus === 'SUCCESS' ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {testResult.success && testResult.results?.testStatus === 'SUCCESS' 
                    ? 'Test Successful' 
                    : 'Test Failed'}
                </AlertTitle>
                <AlertDescription>
                  {testResult.success && testResult.results?.testStatus === 'SUCCESS'
                    ? 'The trial expiration logic is working correctly!'
                    : testResult.error?.error || 'Trial expiration logic is not working correctly. Check console for details.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          
          <CardFooter>
            <Button 
              variant="destructive" 
              onClick={runTest} 
              disabled={isRunningTest || !subscription.trialActive}
              className="w-full"
            >
              {isRunningTest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Test...
                </>
              ) : (
                'Test Trial Expiration'
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
      
      {/* Test Results */}
      {shouldShowResult && testResult && testResult.results && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>Detailed information about the trial expiration test</CardDescription>
          </CardHeader>
          
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify(testResult.results, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 