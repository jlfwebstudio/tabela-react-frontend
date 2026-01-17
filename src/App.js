// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
// import { saveAs } from 'file-saver'; // Removido pois XLSX.writeFile já salva
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Inicializa com 'Data Limite'
  const [sortDirection, setSortDirection] = useState('asc'); // Inicializa com 'asc' (mais antigo para mais novo)
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
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
  ], []);

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função utilitária para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para parsear a data para comparação (retorna objeto Date)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }, []); // Sem dependências, pois é uma função pura

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString); // Usa a função de parse
    if (date) {
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    }
    return dateString; // Retorna original se não conseguir formatar
  }, [parseDateForComparison]); // Depende de parseDateForComparison

  // Função para verificar se uma OS está atrasada
  const isOverdue = useCallback((dataLimite) => {
    const limitDate = parseDateForComparison(dataLimite);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
    return limitDate < today;
  }, [parseDateForComparison]);

  // Função para verificar se uma OS vence hoje
  const isDueToday = useCallback((dataLimite) => {
    const limitDate = parseDateForComparison(dataLimite);
    if (!limitDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return limitDate.getTime() === today.getTime();
  }, [parseDateForComparison]);

  // Função para obter a classe CSS da linha com base no status e data
  const getRowClass = useCallback((row) => {
    const status = row['Status'];
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    const isOverdueItem = isOverdue(dataLimite);
    const isDueTodayItem = isDueToday(dataLimite);
    const isFaltaAbonar = isOverdueItem && (!justificativa || justificativa.trim() === '');

    if (isOverdueItem) {
      return 'row-overdue'; // Vermelho intenso para atrasadas
    }
    if (isDueTodayItem) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    // Se não está atrasada nem vence hoje, usa o azul padrão
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);

  // Função para obter o estilo da célula de Justificativa do Abono
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isOverdueItem = isOverdue(dataLimite);
    const isFaltaAbonar = isOverdueItem && (!justificativa || justificativa.trim() === '');

    if (isFaltaAbonar) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
      };
    }
    return {};
  }, [isOverdue]);

  // Função para obter o texto da célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isOverdueItem = isOverdue(dataLimite);
    const isFaltaAbonar = isOverdueItem && (!justificativa || justificativa.trim() === '');

    return isFaltaAbonar ? 'FALTA ABONAR' : justificativa;
  }, [isOverdue]);

  // Função para lidar com a seleção de arquivo
  const handleFileChange = useCallback((event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para enviar o arquivo CSV para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para fazer upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      // Verifica se a resposta é JSON antes de tentar parsear
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Resposta inesperada do servidor (não é JSON). Status: ${response.status}. Conteúdo: ${text.substring(0, 200)}...`);
      }

      const result = await response.json();

      if (response.ok) {
        // Filtra os dados para incluir apenas os status permitidos
        const filteredData = result.filter(row =>
          allowedStatuses.includes(row['Status'])
        );
        setData(filteredData);
      } else {
        setError(result.error || 'Erro ao processar o arquivo CSV.');
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao conectar com o servidor ou processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para alternar a ordenação da tabela
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Função para obter o ícone de ordenação
  const getSortIcon = useCallback((column) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? faSortUp : faSortDown;
    }
    return faSort;
  }, [sortColumn, sortDirection]);

  // Função para alternar a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [header]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [header]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna
  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null); // Fecha o dropdown após aplicar
  }, []);

  // Função para limpar o filtro de uma coluna específica
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [header]: [] // Limpa as opções selecionadas para esta coluna
    }));
  }, []);

  // Lógica de filtragem e ordenação dos dados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtrar por termo de busca global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por opções de coluna selecionadas
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        currentData = currentData.filter(row =>
          selectedOptions.includes(row[header])
        );
      }
    });

    // 3. Ordenar os dados
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA && dateB) {
            return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          // Lida com datas nulas ou inválidas, colocando-as no final
          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return 1;
          if (dateB === null) return -1;
        }

        // Ordenação padrão para outros tipos de dados
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDateForComparison]);


  // Contagem de OSs atrasadas
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row['Data Limite'])).length;
  }, [filteredAndSortedData, isOverdue]);

  // Função para exportar dados para Excel com formatação
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra apenas os itens atrasados ou vencendo hoje
    const pendingTodayData = filteredAndSortedData.filter(row => {
      const dataLimite = row['Data Limite'];
      return isOverdue(dataLimite) || isDueToday(dataLimite);
    });

    if (pendingTodayData.length === 0) {
      alert('Não há itens pendentes (atrasados ou vencendo hoje) para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(h => h.toUpperCase())]; // Cabeçalhos em maiúsculas

    // Mapeamento de larguras de coluna para o Excel (em unidades de caracteres)
    const colWidths = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 12; break;
        case 'Numero Referencia': width = 18; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 18; break;
        case 'Data Limite': width = 15; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 20; break;
        case 'Cidade': width = 18; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 35; break;
        default: width = 20;
      }
      return { wch: width };
    });

    // Adiciona os dados das linhas com estilos
    pendingTodayData.forEach(row => {
      const newRow = [];
      tableHeaders.forEach(header => {
        let cellValue = row[header];
        let cellStyle = {};

        // Formatação específica para "Data Limite"
        if (header === 'Data Limite') {
          cellValue = formatDataLimite(cellValue); // Garante o formato DD/MM/YYYY
        }

        // Estilo para a célula "Justificativa do Abono"
        if (header === 'Justificativa do Abono') {
          const isOverdueItem = isOverdue(row['Data Limite']);
          const isFaltaAbonar = isOverdueItem && (!row[header] || String(row[header]).trim() === '');
          if (isFaltaAbonar) {
            cellValue = 'FALTA ABONAR';
            cellStyle = {
              fill: { fgColor: { rgb: "FF800080" } }, // Roxo intenso
              font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
              alignment: { vertical: "center", horizontal: "center" }
            };
          } else {
            cellStyle = {
              alignment: { vertical: "center", horizontal: "left" }
            };
          }
        } else {
          // Estilo padrão para outras células
          cellStyle = {
            alignment: { vertical: "center", horizontal: "left" }
          };
        }

        newRow.push({ v: cellValue, t: 's', s: cellStyle }); // 't:s' para tipo string
      });
      ws_data.push(newRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica estilos de cabeçalho
    const headerStyle = {
      fill: { fgColor: { rgb: "FF2F4F4F" } }, // Azul escuro para cabeçalho
      font: { color: { rgb: "FFFFFFFF" }, bold: true }, // Texto branco, negrito
      alignment: { vertical: "center", horizontal: "center" }
    };
    for (let C = 0; C < tableHeaders.length; ++C) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
      if (cell) {
        cell.s = headerStyle;
      }
    }

    // Aplica estilos de linha (cores de fundo)
    for (let R = 1; R < ws_data.length; ++R) { // Começa da segunda linha (índice 1)
      const rowData = pendingTodayData[R - 1]; // Pega os dados originais da linha
      const dataLimite = rowData['Data Limite'];
      const isOverdueItem = isOverdue(dataLimite);
      const isDueTodayItem = isDueToday(dataLimite);

      let rowBgColor = "FFE0F2F7"; // Azul claro padrão
      let rowTextColor = "FF333333"; // Texto escuro padrão

      if (isOverdueItem) {
        rowBgColor = "FFC00000"; // Vermelho intenso
        rowTextColor = "FFFFFFFF"; // Texto branco
      } else if (isDueTodayItem) {
        rowBgColor = "FFFFC000"; // Amarelo
        rowTextColor = "FF333333"; // Texto escuro
      }

      for (let C = 0; C < tableHeaders.length; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (cell && tableHeaders[C] !== 'Justificativa do Abono') { // Não sobrescreve Justificativa do Abono
          cell.s = {
            ...cell.s, // Mantém estilos existentes (como negrito para CNPJ/CPF)
            fill: { fgColor: { rgb: rowBgColor } },
            font: { color: { rgb: rowTextColor } }
          };
        } else if (cell && tableHeaders[C] === 'Justificativa do Abono') {
          // Garante que o estilo da Justificativa do Abono prevaleça
          const isOverdueJustificativa = isOverdue(rowData['Data Limite']);
          const isFaltaAbonarJustificativa = isOverdueJustificativa && (!rowData['Justificativa do Abono'] || String(rowData['Justificativa do Abono']).trim() === '');
          if (!isFaltaAbonarJustificativa) { // Se não é "FALTA ABONAR", aplica a cor da linha
            cell.s = {
              ...cell.s,
              fill: { fgColor: { rgb: rowBgColor } },
              font: { color: { rgb: rowTextColor } }
            };
          }
        }
      }
    }

    // Aplica larguras de coluna
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");

    // Salva o arquivo
    XLSX.writeFile(wb, "Pendentes_Hoje.xlsx");

  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="csv-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} className="process-csv-button" disabled={loading}>
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              OSs Atrasadas: {overdueCount}
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              Exportar Pendentes Hoje (Excel)
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <div className="search-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar na tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => handleSort(header)} className="sortable-header">
                        {header}
                        <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />
                      </span>
                      <div className="filter-container" ref={openFilterDropdown === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown">
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => row[header])))
                                .filter(option => option !== null && option !== undefined && String(option).trim() !== '') // Filtra opções vazias
                                .sort((a, b) => String(a).localeCompare(String(b))) // Ordena alfabeticamente
                                .map(option => (
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
