# Rhino JavaScript engine (used by KMP engine) references java.beans
# classes not available on Android. Suppress R8 warnings.
-dontwarn java.beans.BeanDescriptor
-dontwarn java.beans.BeanInfo
-dontwarn java.beans.IntrospectionException
-dontwarn java.beans.Introspector
-dontwarn java.beans.PropertyDescriptor
