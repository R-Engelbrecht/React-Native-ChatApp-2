import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ChatScreen from './ChatScreen';
import ServicesScreen from './ServicesScreen';
import { createTable } from './sqlite';

const Tab = createBottomTabNavigator();

export default function MainPage({ userData }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    createTable()
      .then(() => {
        console.log('Tables created or already exist');
      })
      .catch((err) => {
        console.error('Failed to create tables:', err);
      });
  }, []);

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Tab.Navigator
        initialRouteName="Chat"
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === 'Chat') {
              iconName = 'chatbubble-outline';
            } else if (route.name === 'Services') {
              iconName = 'construct-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#58737eff',
          tabBarInactiveTintColor: '#fdfdfdc5',
          tabBarStyle: {
            backgroundColor: '#2d3233ff',
            height: 70,
            paddingBottom: 10,
          },
          tabBarLabelStyle: {
            fontSize: 14,
            fontWeight: 'bold',
          },
        })}
      >
        <Tab.Screen
          name="Chat"
          children={(props) => <ChatScreen {...props} userData={userData} />}
          options={{
            headerShown: true,
            headerStyle: {
              backgroundColor: '#181818ff',
            },
            headerTitleStyle: {
              fontWeight: 'bold',
              color: 'white',
            },
            headerTitleAlign: 'center',
          }}
        />
        <Tab.Screen
          name="Services"
          component={ServicesScreen}
          options={{
            headerShown: true,
            headerStyle: {
              backgroundColor: '#8a9caaff',
            },
            headerTitleStyle: {
              fontWeight: 'bold',
              color: 'white',
            },
            headerTitleAlign: 'center',
          }}
        />
      </Tab.Navigator>
    </View>
  );
}