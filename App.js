import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import axios from 'axios';
import AppNavigator from './AppNavigator';
import { ngrok } from './apiConfig';
//import { registerForPushNotificationsAsync } from './PushNotificationConfig.js';




export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);
  const [userData, setUserData] = useState(null); // { userID, name, email }

  //const ngrok = 'https://c932e71d68a9.ngrok-free.app';
  
//   useEffect(() => {
//   configurePushNotifications();
// }, []);

  useEffect(() => {
    async function checkToken() {
      try {
        const token = await AsyncStorage.getItem('remember_token');
        console.log('Loaded token from AsyncStorage:', token);

        if (!token) {
          setUserToken(null);
          setUserData(null);
          setIsLoading(false);
          return;
        }

        // Verify token with server
        const verifyResponse = await fetch(`${ngrok}/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const verifyResult = await verifyResponse.json();

        if (verifyResponse.ok && verifyResult.valid) {
          // Fetch user data
          const userResponse = await axios.get(`${ngrok}/user`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log('User data:', userResponse.data);
          setUserToken(token);
          setUserData(userResponse.data); // { userID, name, email }
        } else {
          console.log('Token invalid or expired');
          await AsyncStorage.removeItem('remember_token');
          setUserToken(null);
          setUserData(null);
        }
      } catch (e) {
        console.error('Failed to verify token or fetch user:', e);
        await AsyncStorage.removeItem('remember_token');
        setUserToken(null);
        setUserData(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkToken();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator
          userToken={userToken}
          userData={userData}
          onLogin={(token, data) => {
            setUserToken(token);
            setUserData(data);
          }}
        />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}