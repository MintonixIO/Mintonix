cmake_minimum_required(VERSION 3.16)
project(mintonix_court_detect LANGUAGES CXX)
find_package(OpenCV REQUIRED COMPONENTS core imgproc videoio imgcodecs highgui)
if(OpenCV_VERSION VERSION_GREATER_EQUAL "5")
  find_package(OpenCV REQUIRED COMPONENTS core imgproc videoio imgcodecs highgui geometry)
endif()
add_executable(mintonix-court-detect
  main.cpp BadmintonCourtFitter.cpp BadmintonCourtModel.cpp
  CourtLineCandidateDetector.cpp CourtLinePixelDetector.cpp DebugHelpers.cpp
  GlobalParameters.cpp Line.cpp TimeMeasurement.cpp geometry.cpp)
target_compile_features(mintonix-court-detect PRIVATE cxx_std_17)
set_target_properties(mintonix-court-detect PROPERTIES NO_SYSTEM_FROM_IMPORTED ON)
target_include_directories(mintonix-court-detect PRIVATE ${OpenCV_INCLUDE_DIRS})
target_link_libraries(mintonix-court-detect PRIVATE ${OpenCV_LIBS})
install(TARGETS mintonix-court-detect RUNTIME DESTINATION bin)
