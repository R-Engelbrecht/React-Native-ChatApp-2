import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ChatScreen from './ChatScreen';
import LoginScreen from './Login';
import MainPage from './MainPage';
import Messages from './Messages';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ userToken, userData, onLogin }) {
  return (
   
    <Stack.Navigator
      initialRouteName={userToken ? 'MainPage' : 'Login'}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name="Login"
        children={(props) => <LoginScreen {...props} onLogin={onLogin} />}
      />
      <Stack.Screen
        name="MainPage"
        children={(props) => <MainPage {...props} userData={userData} />}
      />
      <Stack.Screen
        name="ChatScreen"
        children={(props) => <ChatScreen {...props} userData={userData} />}
      />
      <Stack.Screen
        name="Messages"
        children={(props) => <Messages {...props} userData={userData} />}
      />
    </Stack.Navigator>
    
  );
}