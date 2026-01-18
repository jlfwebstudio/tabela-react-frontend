import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);

  const filterDropdownRef = useRef(null);

  // Define os cabeçalhos da tabela na ordem desejada
  // Memória: "User wants uploaded Mob data to retain all original columns, map Origem to "mob", Cliente to Nome Cliente, Contratante to Getnet/Punto, enforce DD/MM/YYYY dates, and follow a specific column order."
  const defaultTableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
    // 'Origem' // Se a coluna Origem for adicionada, ela deve ser incluída aqui.
  ], []);

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços extras)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str);
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  // Memória: "User prefers all date fields displayed as DD/MM/YYYY without time components."
  // Memória: "User wants dates used exactly as provided by the system without any inversion logic..."
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    // split(' ')[0] para pegar apenas a parte da data, caso haja hora
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null; // Garante que a data está no formato esperado
    const [day, month, year] = parts.map(Number);
    // Cria a data no fuso horário local para evitar problemas de deslocamento
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0); // Zera a hora para comparações precisas
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Formata a data de hoje para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Determina a classe CSS da linha com base no status e data
  // Memória: "User wants rows with past due dates highlighted in red and rows due today highlighted in yellow"
  // Memória: "User prefers a stronger, more intense red for all overdue rows, including those marked “Falta Abonar”, to improve visibility."
  // Memória: "User prefers rows with today’s due date to be highlighted in a subtle yellow background"
  // Memória: "User prefers table row background colors to have higher contrast with text for better readability."
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue'; // Vermelho intenso para atrasado
    }
    if (isDueToday(row)) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return 'row-default-blue'; // Azul claro suave para padrão
  }, [isOverdue, isDueToday]);


  // Estilo para a célula "Justificativa do Abono"
  // Memória: "User wants empty justification cells past due highlighted in purple with the text “Falta Abonar”."
  // Memória: "User wants the ABONAR cell to stay purple regardless of row background color"
  const getJustificativaCellStyle = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    // Condição para "FALTA ABONAR": se a justificativa for vazia ou "falta abonar" (case-insensitive)
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      // Retorna o estilo roxo intenso com texto branco e negrito
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' };
    }
    return {}; // Retorna objeto vazio se não houver estilo especial
  }, [isOverdue, normalizeForComparison]);

  // Texto para a célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';

    if (isOverdue(row) && isAbonarCondition) {
      return 'FALTA ABONAR'; // Texto a ser exibido
    }
    return row['Justificativa do Abono']; // Retorna o valor original
  }, [isOverdue, normalizeForComparison]);


  // Função para obter opções de filtro para uma coluna
  const getColumnFilterOptions = useCallback((columnName) => {
    const options = new Set();
    data.forEach(row => {
      if (row[columnName]) {
        options.add(row[columnName]);
      }
    });
    return Array.from(options).sort((a, b) => String(a).localeCompare(String(b)));
  }, [data]);

  // Efeito para popular os cabeçalhos e opções de filtro quando os dados mudam
  useEffect(() => {
    if (data.length > 0) {
      setTableHeaders(defaultTableHeaders);
      const newFilterOptions = {};
      defaultTableHeaders.forEach(header => {
        newFilterOptions[header] = getColumnFilterOptions(header);
      });
      setFilterOptions(newFilterOptions);
    } else {
      setTableHeaders([]);
      setFilterOptions({});
    }
  }, [data, defaultTableHeaders, getColumnFilterOptions]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  // Memória: "User wants filter dropdown to close when clicking outside the filter window or when opening another filter."
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Lida com a seleção de arquivo
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError('');
    // Memória: "User wants only statuses Encaminhado, Em transferência, Em campo, Reencaminhado, Procedimento Técnico visible and exported."
    // Reseta os filtros de status para o padrão ao carregar um novo arquivo
    setSelectedFilterOptions({
      'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
    });
  };

  // Lida com o upload do arquivo CSV para o backend
  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV.');
      return;
    }

    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();
      setData(result);
      setLoading(false);
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro no upload: ${err.message}`);
      setData([]);
      setLoading(false);
    }
  };

  // Lida com a ordenação da tabela
  // Memória: "User wants the filter dropdown to appear above the table and the Data Limite column sorted in ascending order."
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Padrão ascendente para nova coluna
    }
  }, [sortColumn, sortDirection]);

  // Lida com a mudança de termo de busca
  // Memória: "User wants a search input (magnifying glass) to filter table rows instead of using browser Ctrl+F"
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a mudança de opção de filtro de coluna
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [header]: [...currentOptions, option] };
      }
    });
  }, []);

  // Aplica os filtros de coluna
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após aplicar
  }, []);

  // Limpa os filtros de uma coluna específica
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: []
    }));
    setActiveFilterColumn(null); // Fecha o dropdown após limpar
  }, []);

  // Filtra e ordena os dados para exibição na tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // 1. Filtrar por termo de busca global
    if (searchTerm) {
      const lowerCaseSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = row[header];
          return cellValue !== null && cellValue !== undefined && normalizeForComparison(cellValue).includes(lowerCaseSearchTerm);
        })
      );
    }

    // 2. Filtrar por opções de filtro de coluna
    filteredData = filteredData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se não há opções selecionadas para este filtro, não filtra
        }
        // Verifica se o valor da célula está entre as opções selecionadas
        return selectedOptions.includes(row[header]);
      });
    });

    // 3. Ordenar os dados
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Tratamento especial para 'Data Limite'
      if (sortColumn === 'Data Limite') {
        const dateA = parseDateForComparison(aValue);
        const dateB = parseDateForComparison(bValue);

        if (dateA && dateB) {
          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }
        if (dateA) return sortDirection === 'asc' ? -1 : 1; // Datas válidas vêm antes
        if (dateB) return sortDirection === 'asc' ? 1 : -1;
        return 0; // Ambas inválidas
      }

      // Tratamento para outros tipos de coluna (string ou número)
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      // Fallback para tipos mistos ou nulos
      return 0;
    });

    return sortedData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);

  // Calcula o número de pendências hoje (atrasadas ou vencendo hoje)
  // Memória: "User wants the overdue counter to count all rows with Data Limite earlier than now, regardless of justification."
  const overdueCount = useMemo(() => {
    // Conta sobre os dados originais, não os filtrados, conforme a memória
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);


  // Função para exportar os dados filtrados e ordenados para Excel
  // Memória: "User wants exported Excel sheets to include only today’s pending items (overdue and due today) while preserving table colors."
  // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
  const exportToExcel = useCallback(() => {
    // Filtra os dados para exportação: apenas pendentes (atrasados ou vencendo hoje)
    const filteredForExport = data.filter(row => isOverdue(row) || isDueToday(row));

    if (filteredForExport.length === 0) {
      alert('Não há dados pendentes para exportar.');
      return;
    }

    // Mapeia os dados para um formato de array de arrays para o SheetJS
    const exportData = filteredForExport.map(row =>
      tableHeaders.map(header => {
        // Memória: "User prefers CNPJ/CPF values to be displayed without an equals sign and without surrounding quotation marks."
        if (header === 'CNPJ / CPF') {
          return String(row[header] || '').replace(/['"=]/g, '').trim();
        }
        // Memória: "User wants empty justification cells past due highlighted in purple with the text “Falta Abonar”."
        if (header === 'Justificativa do Abono') {
          return getJustificativaCellText(row);
        }
        // Memória: "User prefers all date fields displayed as DD/MM/YYYY without time components."
        if (header === 'Data Limite') {
          return formatDataLimite(row[header]); // Exporta a string formatada
        }
        return row[header];
      })
    );

    // Adiciona os cabeçalhos no início do array de dados
    const finalData = [tableHeaders, ...exportData];

    // Cria uma nova planilha a partir do array de arrays
    const ws = XLSX.utils.aoa_to_sheet(finalData);

    // --- Aplicação de Estilos e Formatação ---
    // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
    // Memória: "User prefers table row background colors to have higher contrast with text for better readability."

    // Larguras das colunas (em unidades de largura de caractere)
    // Memória: "User prefers all table columns to be wider, allowing horizontal scroll for a better interface."
    // Memória: "User prefers the city column to be slightly wider to avoid line breaks."
    // Memória: "User prefers slightly wider CPF/CNPJ column to avoid line breaks, adjusting width minimally while keeping overall layout compact."
    // Memória: "User prefers adjusting column widths to reduce excess space, especially narrowing reference number column, and wants full service names displayed in the table."
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break; // Ligeiramente mais largo
        case 'Contratante': width = 18; break;
        case 'Serviço': width = 30; break; // Mais largo para nomes completos
        case 'Status': width = 18; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break; // Ligeiramente mais largo
        case 'Cidade': width = 18; break; // Ligeiramente mais largo
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 30; break; // Mais largo
        default: width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos de célula (Header, Overdue, Due Today, Falta Abonar)
    const headerStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const overdueRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "FFFFFF" } }, // Texto branco
      fill: { fgColor: { rgb: "C00000" } }, // Vermelho intenso
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const dueTodayRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "FFC000" } }, // Amarelo
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const defaultRowStyle = {
      font: { name: "Calibri", sz: 12, color: { rgb: "000000" } }, // Texto preto
      fill: { fgColor: { rgb: "E0F2F7" } }, // Azul claro suave
      alignment: { vertical: "center", horizontal: "left", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const abonarCellStyle = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, // Texto branco, negrito
      fill: { fgColor: { rgb: "800080" } }, // Roxo intenso
      alignment: { vertical: "center", horizontal: "center", wrapText: false },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Itera sobre as células para aplicar estilos
    for (let R = 0; R < finalData.length; ++R) { // R de Row (linha)
      const rowData = filteredForExport[R - 1]; // -1 porque a primeira linha é o cabeçalho
      let currentRowStyle = defaultRowStyle;

      if (R === 0) { // Linha do cabeçalho
        currentRowStyle = headerStyle;
      } else if (rowData) { // Linhas de dados
        if (isOverdue(rowData)) {
          currentRowStyle = overdueRowStyle;
        } else if (isDueToday(rowData)) {
          currentRowStyle = dueTodayRowStyle;
        }
      }

      for (let C = 0; C < tableHeaders.length; ++C) { // C de Column (coluna)
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) ws[cellAddress] = {}; // Garante que o objeto da célula exista

        // Aplica o estilo base da linha
        ws[cellAddress].s = { ...currentRowStyle };

        // Tratamento especial para a célula "Justificativa do Abono"
        if (R > 0 && tableHeaders[C] === 'Justificativa do Abono') {
          const justificativa = normalizeForComparison(rowData['Justificativa do Abono']);
          const isAbonarCondition = justificativa === 'falta abonar' || justificativa === '';
          if (isOverdue(rowData) && isAbonarCondition) {
            // Sobrescreve o estilo da linha com o estilo de "FALTA ABONAR"
            ws[cellAddress].s = { ...abonarCellStyle };
            ws[cellAddress].v = 'FALTA ABONAR'; // Garante o texto correto
            ws[cellAddress].t = 's'; // Tipo string
          } else {
            ws[cellAddress].v = rowData['Justificativa do Abono'];
            ws[cellAddress].t = 's';
            // Alinhamento padrão para justificativa que não é "FALTA ABONAR"
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
          }
        }
        // Tratamento especial para 'Data Limite'
        else if (R > 0 && tableHeaders[C] === 'Data Limite') {
          const date = parseDateForComparison(rowData['Data Limite']);
          if (date && !isNaN(date)) {
            // Converte a data para o número de série do Excel
            // XLSX.utils.date_to_excel é a função correta, mas se der erro, a alternativa é:
            // const excelDate = Math.floor(date.getTime() / (1000 * 60 * 60 * 24) + 25569); // Para 1900-based
            ws[cellAddress].v = XLSX.utils.date_to_excel(date, { date1904: false }); // Usando a função oficial
            ws[cellAddress].t = 'n'; // Tipo número
            ws[cellAddress].s.numFmt = 'DD/MM/YYYY'; // Formato de data
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "center" }; // Centraliza
          } else {
            ws[cellAddress].v = String(rowData['Data Limite'] || '');
            ws[cellAddress].t = 's'; // Tipo string
            ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "center" };
          }
        }
        // Tratamento especial para 'CNPJ / CPF'
        // Memória: "User prefers CNPJ/CPF values to be displayed without an equals sign and without surrounding quotation marks."
        else if (R > 0 && tableHeaders[C] === 'CNPJ / CPF') {
          ws[cellAddress].v = String(rowData['CNPJ / CPF'] || '').replace(/['"=]/g, '').trim();
          ws[cellAddress].t = 's'; // Tipo string para evitar formatação numérica
          ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
        }
        // Para outras células de dados
        else if (R > 0) {
          const cellValue = rowData[tableHeaders[C]];
          ws[cellAddress].v = cellValue;
          // Define o tipo da célula (número ou string)
          ws[cellAddress].t = typeof cellValue === 'number' ? 'n' : 's';
          // Alinhamento padrão para texto, pode ser ajustado por coluna se necessário
          ws[cellAddress].s.alignment = { ...ws[cellAddress].s.alignment, horizontal: "left" };
        }
        // Para células do cabeçalho (já tratadas pelo headerStyle)
        else if (R === 0) {
          ws[cellAddress].v = tableHeaders[C];
          ws[cellAddress].t = 's';
        }
      }
    }

    // Adiciona autofiltro
    // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(tableHeaders.length - 1)}${filteredForExport.length + 1}` };

    // Congela a primeira linha (cabeçalhos)
    // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // Cria o workbook e adiciona a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes');

    // Define a cor da aba
    // Memória: "User wants exported Excel files to have enhanced visual presentation, including richer formatting, colors, and optional graphics for a more professional look."
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    wb.Workbook.Sheets[0] = {
      ...wb.Workbook.Sheets[0],
      TabColor: { rgb: "4472C4" } // Azul escuro
    };

    // Gera o arquivo Excel
    XLSX.writeFile(wb, `Pendentes_Hoje_${todayFormatted}.xlsx`);

  }, [data, tableHeaders, isOverdue, isDueToday, getJustificativaCellText, parseDateForComparison, formatDataLimite, normalizeForComparison, todayFormatted]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} />
            {file && <span className="file-name">{file.name}</span>}
            <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar em toda a tabela..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Pendentes Hoje: {overdueCount}
            </div>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? (
                            <FontAwesomeIcon icon={faSortUp} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSortDown} className="sort-icon" />
                          )
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
                            : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
