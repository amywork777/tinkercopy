import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useScene } from "@/hooks/use-scene";
import { Download, Trash, Box, Type, Paintbrush, Upload, Shapes, Bot, Circle, Triangle, CircleDot, Layers, Droplets, Badge, Sparkles, Zap, Pencil, Printer } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ModelList } from "./ModelList";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { ModelLibrary } from "./ModelLibrary";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// Font options with their display names and paths
const FONTS = [
  { name: "Roboto", path: "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json" },
  { name: "Times New Roman", path: "https://threejs.org/examples/fonts/gentilis_regular.typeface.json" },
  { name: "Courier", path: "https://threejs.org/examples/fonts/droid/droid_serif_regular.typeface.json" },
  { name: "Open Sans", path: "https://threejs.org/examples/fonts/optimer_regular.typeface.json" }
];

export function Sidebar() {
  const { 
    loadSTL, 
    loadSVG,
    exportSelectedModelAsSTL, 
    selectedModelIndex,
    removeModel,
    scene,
    selectModel,
    saveHistoryState,
    loadText,
    models,
    renderingMode,
    setRenderingMode
  } = useScene();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("uploads");
  
  // State for copied model
  const [copiedModel, setCopiedModel] = useState<any>(null);
  
  // Text form state
  const [text, setText] = useState("Text");
  const [fontSize, setFontSize] = useState(5);
  const [height, setHeight] = useState(2);
  const [curveSegments, setCurveSegments] = useState(4);
  const [bevelEnabled, setBevelEnabled] = useState(true);
  const [bevelThickness, setBevelThickness] = useState(0.2);
  const [bevelSize, setBevelSize] = useState(0.1);
  const [bevelSegments, setBevelSegments] = useState(3);
  const [selectedFont, setSelectedFont] = useState(FONTS[0].path);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTextModelId, setEditingTextModelId] = useState<string | null>(null);
  
  // Material states
  const [materialColor, setMaterialColor] = useState("#3498db");
  const [backgroundColor, setBackgroundColor] = useState("#f0f0f0");
  const [backgroundType, setBackgroundType] = useState("solid"); // solid, gradient, or skybox
  const [gradientTopColor, setGradientTopColor] = useState("#87ceeb"); // sky blue
  const [gradientBottomColor, setGradientBottomColor] = useState("#ffffff"); // white
  
  // Show/hide grid and axes
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  
  // Check if the currently selected model is a text model that can be edited
  const selectedTextModel = selectedModelIndex !== null && models[selectedModelIndex] 
    ? models[selectedModelIndex].type === 'text' ? models[selectedModelIndex] : null 
    : null;

  // Sketch state
  const [sketchLines, setSketchLines] = useState<Array<{points: {x: number, y: number}[]}>>([]); 
  const [currentLine, setCurrentLine] = useState<{x: number, y: number}[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [extrusionDepth, setExtrusionDepth] = useState(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Add keyboard event handler for copy, paste, and delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're not in an input field or textarea
      const activeElement = document.activeElement;
      const isInputActive = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.getAttribute('contenteditable') === 'true'
      );
      
      if (isInputActive) return;
      
      // Copy with Ctrl+C or Command+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopyModel();
      }
      
      // Paste with Ctrl+V or Command+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        handlePasteModel();
      }
      
      // Delete with Delete key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelectedModel();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedModelIndex, models, copiedModel]);
  
  // Function to handle copying a model
  const handleCopyModel = () => {
    if (selectedModelIndex === null || !models[selectedModelIndex]) return;
    
    const modelToCopy = models[selectedModelIndex];
    setCopiedModel(modelToCopy);
    
    toast({
      title: "Model Copied",
      description: `${modelToCopy.name} copied to clipboard`,
      duration: 2000,
    });
  };
  
  // Function to handle pasting a model
  const handlePasteModel = () => {
    if (!copiedModel) {
      toast({
        title: "Nothing to Paste",
        description: "Copy a model first",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    // Clone the geometry
    const originalGeometry = copiedModel.mesh.geometry;
    const clonedGeometry = originalGeometry.clone();
    
    // Clone the material
    let clonedMaterial;
    if (Array.isArray(copiedModel.mesh.material)) {
      clonedMaterial = copiedModel.mesh.material.map(mat => mat.clone());
    } else {
      clonedMaterial = copiedModel.mesh.material.clone();
    }
    
    // Create a new mesh
    const newMesh = new THREE.Mesh(clonedGeometry, clonedMaterial);
    newMesh.castShadow = true;
    newMesh.receiveShadow = true;
    
    // Position the new mesh slightly offset from the original
    newMesh.position.copy(copiedModel.mesh.position);
    newMesh.position.x += 2; // Offset to make it visible
    newMesh.rotation.copy(copiedModel.mesh.rotation);
    newMesh.scale.copy(copiedModel.mesh.scale);
    
    // Store original transform
    const originalPosition = newMesh.position.clone();
    const originalRotation = newMesh.rotation.clone();
    const originalScale = newMesh.scale.clone();
    
    // Add to scene
    scene.add(newMesh);
    
    // Create a new model object
    const newModel = {
      id: `${copiedModel.type || 'model'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${copiedModel.name} (Copy)`,
      type: copiedModel.type || 'model',
      mesh: newMesh,
      originalPosition,
      originalRotation,
      originalScale,
      // Copy any additional properties if needed
      ...(copiedModel.textProps ? { textProps: { ...copiedModel.textProps } } : {})
    };
    
    // Add to models array
    const updatedModels = [...models, newModel];
    useScene.setState({ models: updatedModels });
    
    // Select the new model
    const newIndex = updatedModels.length - 1;
    selectModel(newIndex);
    
    // Save to history
    saveHistoryState();
    
    toast({
      title: "Model Pasted",
      description: `${newModel.name} added to scene`,
      duration: 2000,
    });
  };
  
  // Function to handle deleting the selected model
  const handleDeleteSelectedModel = () => {
    if (selectedModelIndex === null) return;
    
    const modelName = models[selectedModelIndex].name;
    removeModel(selectedModelIndex);
    
    toast({
      title: "Model Deleted",
      description: `${modelName} removed from scene`,
      duration: 2000,
    });
  };
  
  // When a text model is selected, load its parameters into the form
  useEffect(() => {
    if (selectedTextModel) {
      setEditingTextModelId(selectedTextModel.id);
      
      // If the model has text properties, set them in the form
      if (selectedTextModel.textProps) {
        setText(selectedTextModel.textProps.text || "Text");
        setFontSize(selectedTextModel.textProps.fontSize || 5);
        setHeight(selectedTextModel.textProps.height || 2);
        setCurveSegments(selectedTextModel.textProps.curveSegments || 4);
        setBevelEnabled(selectedTextModel.textProps.bevelEnabled !== undefined ? selectedTextModel.textProps.bevelEnabled : true);
        setBevelThickness(selectedTextModel.textProps.bevelThickness || 0.2);
        setBevelSize(selectedTextModel.textProps.bevelSize || 0.1);
        setBevelSegments(selectedTextModel.textProps.bevelSegments || 3);
        setSelectedFont(selectedTextModel.textProps.fontPath || FONTS[0].path);
      }
    } else {
      setEditingTextModelId(null);
    }
  }, [selectedModelIndex, models]);

  const handleCreateText = async () => {
    if (!text.trim()) {
      toast({
        title: "Error",
        description: "Text cannot be empty",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Create a new text model or update existing one
      const textProps = {
        text,
        fontSize,
        height,
        curveSegments,
        bevelEnabled,
        bevelThickness,
        bevelSize,
        bevelSegments,
        fontPath: selectedFont
      };
      
      await loadText(text, textProps);
      
      toast({
        title: "Success",
        description: "3D text created successfully",
      });
      
      // After creating, select the model to edit it
      const { models } = useScene.getState();
      const newIndex = models.length - 1;
      selectModel(newIndex);
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create 3D text",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleUpdateText = async () => {
    if (!text.trim() || !editingTextModelId || selectedModelIndex === null) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Update the existing text model
      const textProps = {
        text,
        fontSize,
        height,
        curveSegments,
        bevelEnabled,
        bevelThickness,
        bevelSize,
        bevelSegments,
        fontPath: selectedFont
      };
      
      await loadText(text, textProps, selectedModelIndex);
      
      toast({
        title: "Success",
        description: "3D text updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update 3D text",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  const handleAddCube = () => {
    // Create a cube geometry
    const geometry = new THREE.BoxGeometry(5, 5, 5);
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Position mesh slightly above the grid
    mesh.position.y = 2.5;
    
    // Store original transform
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    // Add to scene
    scene.add(mesh);
    
    // Create model object
    const newModel = {
      id: `cube-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Cube ${Date.now()}`,
      type: 'cube',
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    // Add to models array
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    // Select the new model
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    // Save to history
    saveHistoryState();
    
    toast({
      title: "Cube added",
      description: "A new cube has been added to the scene",
    });
  };

  const handleAddSphere = () => {
    const geometry = new THREE.SphereGeometry(3, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 3;
    
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    scene.add(mesh);
    
    const newModel = {
      id: `sphere-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Sphere ${Date.now()}`,
      type: 'sphere',
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    saveHistoryState();
    
    toast({
      title: "Sphere added",
      description: "A new sphere has been added to the scene",
    });
  };

  const handleAddCylinder = () => {
    const geometry = new THREE.CylinderGeometry(2.5, 2.5, 5, 32);
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 2.5;
    
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    scene.add(mesh);
    
    const newModel = {
      id: `cylinder-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Cylinder ${Date.now()}`,
      type: 'cylinder',
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    saveHistoryState();
    
    toast({
      title: "Cylinder added",
      description: "A new cylinder has been added to the scene",
    });
  };

  const handleAddCone = () => {
    const geometry = new THREE.ConeGeometry(3, 5, 32);
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 2.5;
    
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    scene.add(mesh);
    
    const newModel = {
      id: `cone-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Cone ${Date.now()}`,
      type: 'cone',
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    saveHistoryState();
    
    toast({
      title: "Cone added",
      description: "A new cone has been added to the scene",
    });
  };

  const handleAddTorus = () => {
    const geometry = new THREE.TorusGeometry(3, 1, 16, 50);
    const material = new THREE.MeshStandardMaterial({ 
      color: Math.random() * 0xffffff,
      metalness: 0.1,
      roughness: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 2.5;
    
    const originalPosition = mesh.position.clone();
    const originalRotation = mesh.rotation.clone();
    const originalScale = mesh.scale.clone();
    
    scene.add(mesh);
    
    const newModel = {
      id: `torus-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `Torus ${Date.now()}`,
      type: 'torus',
      mesh,
      originalPosition,
      originalRotation,
      originalScale
    };
    
    const { models } = useScene.getState();
    const newModels = [...models, newModel];
    useScene.setState({ models: newModels });
    
    const newIndex = newModels.length - 1;
    selectModel(newIndex);
    
    saveHistoryState();
    
    toast({
      title: "Torus added",
      description: "A new torus has been added to the scene",
    });
  };
  
  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl,.svg';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        
        if (fileExt === 'stl') {
          await loadSTL(file);
          toast({
            title: "Import Successful",
            description: `Imported STL: ${file.name}`
          });
        } else if (fileExt === 'svg') {
          await loadSVG(file);
          toast({
            title: "Import Successful",
            description: `Converted SVG to 3D: ${file.name}`
          });
        } else {
          toast({
            title: "Import Failed",
            description: "Unsupported file format. Please use STL or SVG files.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Import error:", error);
        toast({
          title: "Import Failed",
          description: "There was an error importing your file",
          variant: "destructive",
        });
      }
    };
    input.click();
  };
  
  const handleExportModel = () => {
    if (selectedModelIndex !== null) {
      try {
        // Get the blob from the export function
        const blob = exportSelectedModelAsSTL();
        if (!blob) {
          throw new Error("Failed to generate STL file");
        }
        
        // Create a download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `model-export-${Date.now()}.stl`;
        link.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        
        toast({
          title: "Export Successful",
          description: "Your model has been exported as STL"
        });
      } catch (error) {
        console.error("Export error:", error);
        toast({
          title: "Export Failed",
          description: "There was an error exporting your model",
          variant: "destructive",
        });
      }
    }
  };
  
  // Apply color to model
  const applyColorToModel = () => {
    if (selectedModelIndex === null || !models[selectedModelIndex]) return;
    
    const model = models[selectedModelIndex];
    const mesh = model.mesh;
    
    // Get the current material and update its color
    const currentMaterial = mesh.material;
    if (currentMaterial) {
      if (Array.isArray(currentMaterial)) {
        // Handle multi-material objects
        currentMaterial.forEach(mat => {
          if (mat.color) mat.color.set(materialColor);
        });
      } else {
        // Single material
        if (currentMaterial.color) currentMaterial.color.set(materialColor);
      }
    }
    
    // Force a render
    scene.needsUpdate = true;
    
    // Save state for undo/redo
    saveHistoryState();
    
    toast({
      title: "Color Updated",
      description: "Applied new color to model",
      duration: 2000,
    });
  };

  // Apply background changes
  const applyBackgroundChange = () => {
    if (backgroundType === "solid") {
      scene.background = new THREE.Color(backgroundColor);
    } else if (backgroundType === "gradient") {
      // Create a canvas for gradient
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      
      const context = canvas.getContext('2d');
      if (context) {
        const gradient = context.createLinearGradient(0, 0, 0, 2);
        gradient.addColorStop(0, gradientTopColor);
        gradient.addColorStop(1, gradientBottomColor);
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2, 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        scene.background = texture;
      }
    }
    
    // Force a render
    scene.needsUpdate = true;
    
    toast({
      title: "Background Updated",
      description: `Applied ${backgroundType} background`,
      duration: 2000,
    });
  };

  // Toggle visibility of grid and axes
  const toggleGridVisibility = (checked: boolean) => {
    setShowGrid(checked);
    // Find grid in scene and toggle visibility
    const findAndToggleGrid = (obj: THREE.Object3D) => {
      if (obj.name && obj.name.toLowerCase().includes('grid')) {
        obj.visible = checked;
      }
      // Check children recursively
      obj.children.forEach(child => findAndToggleGrid(child));
    };
    
    scene.children.forEach(child => findAndToggleGrid(child));
    scene.needsUpdate = true;
  };
  
  const toggleAxesVisibility = (checked: boolean) => {
    setShowAxes(checked);
    // Find axes in scene and toggle visibility
    const findAndToggleAxes = (obj: THREE.Object3D) => {
      if (obj.name && (obj.name.toLowerCase().includes('axe') || obj.name.toLowerCase().includes('axis'))) {
        obj.visible = checked;
      }
      // Check children recursively
      obj.children.forEach(child => findAndToggleAxes(child));
    };
    
    scene.children.forEach(child => findAndToggleAxes(child));
    scene.needsUpdate = true;
  };

  // Function to sync color when selecting a model
  useEffect(() => {
    if (selectedModelIndex !== null && models[selectedModelIndex]) {
      const model = models[selectedModelIndex];
      const material = model.mesh.material;
      
      // Set color
      if (material && 'color' in material) {
        setMaterialColor('#' + material.color.getHexString());
      }
    }
  }, [selectedModelIndex, models]);

  // Function to start drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentLine([{x, y}]);
    setIsDrawing(true);
  };
  
  // Function to continue drawing
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentLine([...currentLine, {x, y}]);
    
    // Draw the line
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      
      if (currentLine.length > 1) {
        ctx.beginPath();
        const prevPoint = currentLine[currentLine.length - 2];
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };
  
  // Function to end drawing
  const endDrawing = () => {
    if (currentLine.length > 1) {
      setSketchLines([...sketchLines, {points: currentLine}]);
    }
    setCurrentLine([]);
    setIsDrawing(false);
  };
  
  // Function to clear the canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSketchLines([]);
      setCurrentLine([]);
    }
  };
  
  // Function to convert sketch to SVG and extrude
  const convertSketchToModel = () => {
    if (sketchLines.length === 0) {
      toast({
        title: "No sketch found",
        description: "Please draw something first",
        variant: "destructive",
      });
      return;
    }
    
    // Create an SVG from the sketch
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '600');
    
    // Get canvas dimensions for coordinate transformation
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasHeight = canvas.height;
    
    // Create a path for each line
    sketchLines.forEach(line => {
      if (line.points.length > 1) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Invert Y coordinate to prevent the sketch from being upside down
        // SVG coordinates increase downward, but we want to flip this behavior
        const transformedPoints = line.points.map(point => ({
          x: point.x,
          y: canvasHeight - point.y // Invert Y coordinate
        }));
        
        let d = `M ${transformedPoints[0].x} ${transformedPoints[0].y}`;
        
        for (let i = 1; i < transformedPoints.length; i++) {
          d += ` L ${transformedPoints[i].x} ${transformedPoints[i].y}`;
        }
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
      }
    });
    
    // Convert SVG to blob
    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], {type: 'image/svg+xml'});
    const file = new File([blob], `sketch-${Date.now()}.svg`, {type: 'image/svg+xml'});
    
    // Load the SVG and extrude it
    loadSVG(file, extrusionDepth).then(() => {
      toast({
        title: "Sketch extruded",
        description: "Your sketch has been converted to a 3D model",
      });
      
      // Clear the canvas after successful conversion
      clearCanvas();
      
      // Switch to the uploads tab to see the model
      setActiveTab("uploads");
    }).catch(error => {
      console.error("Error extruding sketch:", error);
      toast({
        title: "Extrusion failed",
        description: "There was an error creating your 3D model",
        variant: "destructive",
      });
    });
  };
  
  // Initialize canvas when component mounts or when active tab changes
  useEffect(() => {
    if (activeTab === "sketch" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas dimensions
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      
      // Clear canvas
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Redraw existing lines
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
        
        sketchLines.forEach(line => {
          if (line.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(line.points[0].x, line.points[0].y);
            
            for (let i = 1; i < line.points.length; i++) {
              ctx.lineTo(line.points[i].x, line.points[i].y);
            }
            
            ctx.stroke();
          }
        });
      }
    }
  }, [activeTab, sketchLines]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex items-center justify-between border-b">
        <h1 className="text-xl font-bold">Model Fusion Studio</h1>
      </div>
      
      <div className="flex-1 flex flex-col">
        <Tabs 
          defaultValue="uploads" 
          className="flex-1 flex flex-row h-full"
          value={activeTab}
          onValueChange={handleTabChange}
        >
          <TabsList className="flex flex-col h-full py-4 border-r space-y-2 w-20 shrink-0 overflow-y-auto">
            <TabsTrigger value="uploads" className="flex justify-center items-center flex-col py-3 px-2">
              <Upload className="h-5 w-5" />
              <span className="text-xs mt-1">Uploads</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="flex justify-center items-center flex-col py-3 px-2">
              <Box className="h-5 w-5" />
              <span className="text-xs mt-1">Library</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex justify-center items-center flex-col py-3 px-2">
              <Bot className="h-5 w-5" />
              <span className="text-xs mt-1">AI</span>
            </TabsTrigger>
            <TabsTrigger value="shapes" className="flex justify-center items-center flex-col py-3 px-2">
              <Shapes className="h-5 w-5" />
              <span className="text-xs mt-1">Shapes</span>
            </TabsTrigger>
            <TabsTrigger value="sketch" className="flex justify-center items-center flex-col py-3 px-2">
              <Pencil className="h-5 w-5" />
              <span className="text-xs mt-1">Sketch</span>
            </TabsTrigger>
            <TabsTrigger value="text" className="flex justify-center items-center flex-col py-3 px-2">
              <Type className="h-5 w-5" />
              <span className="text-xs mt-1">Text</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex justify-center items-center flex-col py-3 px-2">
              <Paintbrush className="h-5 w-5" />
              <span className="text-xs mt-1">Appearance</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden">
            {/* Uploads Tab */}
            <TabsContent value="uploads" className="flex-1 overflow-y-auto p-3 space-y-4 h-full">
              <div className="flex flex-col space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleImportClick}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Import STL or SVG
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleExportModel}
                  disabled={selectedModelIndex === null}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Export STL
                </Button>
              </div>
              
              <div className="text-xs text-muted-foreground mt-1 mb-2">
                Keyboard shortcuts:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Copy model: Ctrl/Cmd + C</li>
                  <li>Paste model: Ctrl/Cmd + V</li>
                  <li>Delete model: Delete key</li>
                </ul>
              </div>
              
              <ModelList />
            </TabsContent>
            
            {/* 3D Library Tab */}
            <TabsContent value="library" className="flex-1 overflow-y-auto p-3 h-full">
              <ModelLibrary />
            </TabsContent>
            
            {/* AI Model Generator Tab */}
            <TabsContent value="ai" className="flex-1 overflow-y-auto p-3 h-full">
              <div className="flex flex-col items-center justify-center h-full">
                <Bot className="h-12 w-12 text-muted-foreground mb-2" />
                <h3 className="text-lg font-medium">AI Model Generator</h3>
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Create custom 3D models with AI assistance.
                  Coming soon!
                </p>
              </div>
            </TabsContent>
            
            {/* Shapes Tab */}
            <TabsContent value="shapes" className="flex-1 overflow-y-auto p-3 h-full">
              <div className="flex flex-col space-y-2">
                <h3 className="text-lg font-medium mb-2">Basic Shapes</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleAddCube}
                >
                  <Box className="mr-1 h-4 w-4" />
                  Add Cube
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleAddSphere}
                >
                  <Circle className="mr-1 h-4 w-4" />
                  Add Sphere
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleAddCylinder}
                >
                  <div className="mr-1 h-4 w-4 flex items-center justify-center">
                    <div className="h-4 w-3 rounded-sm bg-current"></div>
                  </div>
                  Add Cylinder
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleAddCone}
                >
                  <Triangle className="mr-1 h-4 w-4" />
                  Add Cone
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleAddTorus}
                >
                  <CircleDot className="mr-1 h-4 w-4" />
                  Add Torus
                </Button>
              </div>
            </TabsContent>
            
            {/* Sketch Tab */}
            <TabsContent value="sketch" className="flex-1 overflow-y-auto p-3 h-full">
              <div className="flex flex-col space-y-4">
                <h3 className="text-lg font-medium">Sketch & Extrude</h3>
                <p className="text-sm text-muted-foreground">
                  Draw a shape and it will be extruded into a 3D model
                </p>
                
                {/* Canvas for drawing */}
                <div className="border rounded-md p-2 bg-white" style={{ height: '300px' }}>
                  <canvas 
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={endDrawing}
                    onMouseLeave={endDrawing}
                  />
                </div>
                
                {/* Controls */}
                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="text-sm font-medium mb-2">Extrusion Settings</h4>
                  
                  <div className="flex items-center gap-4">
                    <Label className="w-20 text-sm">Depth</Label>
                    <div className="flex-1 flex items-center gap-3">
                      <Slider
                        value={[extrusionDepth]}
                        min={1}
                        max={50}
                        step={1}
                        onValueChange={(value) => setExtrusionDepth(value[0])}
                        className="flex-1"
                      />
                      <span className="w-8 text-sm text-center">
                        {extrusionDepth}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Action buttons */}
                <div className="flex flex-col space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearCanvas}
                  >
                    Clear Sketch
                  </Button>
                  
                  <Button
                    onClick={convertSketchToModel}
                  >
                    Create 3D Model
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            {/* Text Tab */}
            <TabsContent value="text" className="flex-1 overflow-y-auto p-3 h-full">
              <div className="flex flex-col space-y-4">
                <h3 className="text-lg font-medium">Create 3D Text</h3>
                <p className="text-sm text-muted-foreground">
                  {editingTextModelId 
                    ? "Edit your 3D text with the settings below" 
                    : "Configure your text settings and add it to the scene"}
                </p>
                
                <div className="flex flex-col space-y-4">
                  {/* Text Input */}
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label htmlFor="text-input" className="text-right text-sm">
                      Text
                    </Label>
                    <Input
                      id="text-input"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  
                  {/* Font Selection */}
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label htmlFor="font-select" className="text-right text-sm">
                      Font
                    </Label>
                    <Select value={selectedFont} onValueChange={setSelectedFont}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select a font" />
                      </SelectTrigger>
                      <SelectContent>
                        {FONTS.map((font) => (
                          <SelectItem key={font.path} value={font.path}>
                            {font.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Create or Update Button */}
                  <Button 
                    onClick={editingTextModelId ? handleUpdateText : handleCreateText} 
                    disabled={isLoading || (editingTextModelId && !selectedTextModel)}
                    className="mb-4"
                  >
                    {isLoading 
                      ? "Processing..." 
                      : editingTextModelId 
                        ? "Update 3D Text" 
                        : "Create 3D Text"}
                  </Button>
                  
                  {/* Settings Heading */}
                  <div className="border-t pt-4 mt-2">
                    <h4 className="text-sm font-medium mb-4">
                      {editingTextModelId 
                        ? "Adjust Text Properties" 
                        : "Text Properties"}
                    </h4>
                  </div>
                  
                  {/* Text Style Controls */}
                  <div className="grid gap-6">
                    <div className="flex items-center gap-4">
                      <Label className="w-24 text-right text-sm whitespace-nowrap">Font Size</Label>
                      <div className="flex-1 flex items-center gap-3">
                        <Slider
                          value={[fontSize]}
                          min={1}
                          max={20}
                          step={0.5}
                          onValueChange={(value) => setFontSize(value[0])}
                          className="flex-1"
                        />
                        <span className="w-8 text-sm text-center">
                          {fontSize}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Label className="w-24 text-right text-sm">Depth</Label>
                      <div className="flex-1 flex items-center gap-3">
                        <Slider
                          value={[height]}
                          min={0.1}
                          max={10}
                          step={0.1}
                          onValueChange={(value) => setHeight(value[0])}
                          className="flex-1"
                        />
                        <span className="w-8 text-sm text-center">
                          {height}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Label className="w-24 text-right text-sm">Segments</Label>
                      <div className="flex-1 flex items-center gap-3">
                        <Slider
                          value={[curveSegments]}
                          min={1}
                          max={10}
                          step={1}
                          onValueChange={(value) => setCurveSegments(value[0])}
                          className="flex-1"
                        />
                        <span className="w-8 text-sm text-center">
                          {curveSegments}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <Label className="w-24 text-right text-sm">Bevel</Label>
                      <div className="flex-1 flex items-center gap-3">
                        <Checkbox
                          checked={bevelEnabled}
                          onCheckedChange={(checked) => 
                            setBevelEnabled(checked === true)
                          }
                          id="bevel"
                        />
                        <Label htmlFor="bevel" className="text-sm font-normal">
                          Enable bevel
                        </Label>
                      </div>
                    </div>
                    
                    {bevelEnabled && (
                      <>
                        <div className="flex items-center gap-4">
                          <Label className="w-24 text-right text-sm">Thickness</Label>
                          <div className="flex-1 flex items-center gap-3">
                            <Slider
                              value={[bevelThickness]}
                              min={0.01}
                              max={1}
                              step={0.01}
                              disabled={!bevelEnabled}
                              onValueChange={(value) => setBevelThickness(value[0])}
                              className="flex-1"
                            />
                            <span className="w-8 text-sm text-center">
                              {bevelThickness}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <Label className="w-24 text-right text-sm">Size</Label>
                          <div className="flex-1 flex items-center gap-3">
                            <Slider
                              value={[bevelSize]}
                              min={0.01}
                              max={1}
                              step={0.01}
                              disabled={!bevelEnabled}
                              onValueChange={(value) => setBevelSize(value[0])}
                              className="flex-1"
                            />
                            <span className="w-8 text-sm text-center">
                              {bevelSize}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <Label className="w-24 text-right text-sm">Segments</Label>
                          <div className="flex-1 flex items-center gap-3">
                            <Slider
                              value={[bevelSegments]}
                              min={1}
                              max={10}
                              step={1}
                              disabled={!bevelEnabled}
                              onValueChange={(value) => setBevelSegments(value[0])}
                              className="flex-1"
                            />
                            <span className="w-8 text-sm text-center">
                              {bevelSegments}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* Materials Tab - Now Appearance Tab */}
            <TabsContent value="appearance" className="flex-1 overflow-y-auto p-3 h-full">
              <div className="flex flex-col space-y-4">
                <h3 className="text-lg font-medium">Appearance & Environment</h3>
                
                {/* Model Appearance */}
                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="text-sm font-medium mb-2">Model Appearance</h4>
                  
                  {selectedModelIndex === null ? (
                    <div className="flex flex-col items-center justify-center py-4">
                      <Paintbrush className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        Select a model to change its color
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Color Picker */}
                      <div className="flex flex-col space-y-3">
                        <div className="flex items-center gap-4">
                          <Label className="w-20 text-sm">Color</Label>
                          <input 
                            type="color" 
                            value={materialColor}
                            onChange={(e) => setMaterialColor(e.target.value)}
                            className="w-10 h-8 border cursor-pointer"
                          />
                        </div>
                        <Button 
                          onClick={applyColorToModel}
                          size="sm"
                        >
                          Apply Color
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Scene Visibility */}
                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="text-sm font-medium mb-2">Scene Elements</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-grid"
                        checked={showGrid}
                        onCheckedChange={toggleGridVisibility}
                      />
                      <Label htmlFor="show-grid" className="text-sm font-normal cursor-pointer">
                        Show Grid
                      </Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-axes"
                        checked={showAxes}
                        onCheckedChange={toggleAxesVisibility}
                      />
                      <Label htmlFor="show-axes" className="text-sm font-normal cursor-pointer">
                        Show Axes
                      </Label>
                    </div>
                  </div>
                </div>
                
                {/* Environment Settings */}
                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="text-sm font-medium mb-2">Background</h4>
                  
                  {/* Background Type */}
                  <div className="space-y-3">
                    <Label className="text-sm">Background Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant={backgroundType === "solid" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setBackgroundType("solid")}
                        className="flex items-center justify-center gap-1 h-9"
                      >
                        <span>Solid Color</span>
                      </Button>
                      <Button 
                        variant={backgroundType === "gradient" ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setBackgroundType("gradient")}
                        className="flex items-center justify-center gap-1 h-9"
                      >
                        <span>Gradient</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Background Color Settings */}
                  {backgroundType === "solid" ? (
                    <div className="flex items-center gap-4">
                      <Label className="w-20 text-sm">Color</Label>
                      <input 
                        type="color" 
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-10 h-8 border cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <Label className="w-20 text-sm">Top Color</Label>
                        <input 
                          type="color" 
                          value={gradientTopColor}
                          onChange={(e) => setGradientTopColor(e.target.value)}
                          className="w-10 h-8 border cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <Label className="w-20 text-sm">Bottom Color</Label>
                        <input 
                          type="color" 
                          value={gradientBottomColor}
                          onChange={(e) => setGradientBottomColor(e.target.value)}
                          className="w-10 h-8 border cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Apply Background Button */}
                  <Button 
                    onClick={applyBackgroundChange}
                    className="w-full"
                  >
                    Apply Background
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
